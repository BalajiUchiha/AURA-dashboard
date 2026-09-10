"""
server.py — AURA Backend FastAPI Server.

Starts both the FastAPI REST/WebSocket application AND the background
analysis loop (Fetch → EKF → Alert → ML → Charging → JARVIS → Write Insights).

Endpoints:
    GET /latest         — returns combined live telemetry + latest insights cache
    GET /history        — returns last N insights rows (default 20, max 200)
    GET /alerts         — returns recent active alerts where alert_flag != 'none'
    GET /health         — server and background loop health status
    WS  /ws/live        — WebSocket pushing live cycle updates on completion
"""

import asyncio
import time
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Optional

import httpx
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn

import config as cfg
from supabase_client import fetch_recent_history, write_insight, fetch_recent_insights, fetch_recent_alerts
from ekf_filter import voltage_ekf, current_ekf, speed_ekf
from alert_engine import analyze_alerts
from ml_predictor import predict_degradation
from jarvis_client import get_jarvis_message
import mqtt_ingest

# ── Shared In-Memory Cache & State ─────────────────────────────────────
_server_start_time = time.time()
_latest_cache: Optional[dict] = None
_last_seen_at: Optional[str] = None
_loop_running: bool = False
_last_cycle_timestamp: Optional[str] = None
_last_cycle_error: Optional[str] = None
_background_task: Optional[asyncio.Task] = None

_last_ml_prediction_time_ms: Optional[float] = None
_last_gemini_call_status: str = "not_yet_called"
_last_gemini_call_time_ms: Optional[float] = None
_last_openchargemap_call_status: str = "not_triggered"

active_websockets: set[WebSocket] = set()


def derive_severity(alert_flag: str) -> str:
    """Derive severity string from alert_flag."""
    if alert_flag in ("low_battery", "thermal_stress_indicator"):
        return "critical"
    elif alert_flag == "unusual_power_draw":
        return "warning"
    return "info"


def derive_priority(severity: str) -> str:
    """Derive priority flag: high, medium, low."""
    if severity == "critical":
        return "high"
    elif severity == "warning":
        return "medium"
    return "low"


def derive_driver_visible(severity: str) -> bool:
    """Derive whether an alert is driver-visible (true for critical/warning)."""
    return severity in ("critical", "warning")


def _parse_timestamp(row: dict) -> float:
    """Extract a float epoch-seconds timestamp from a row."""
    ts_str = row.get("created_at") or row.get("updated_at")
    if ts_str is None:
        return datetime.now(timezone.utc).timestamp()
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        return dt.timestamp()
    except (ValueError, AttributeError):
        return datetime.now(timezone.utc).timestamp()


def _run_ekf_on_readings(readings: list[dict]) -> dict:
    """Pass a batch of readings through the three EKF instances."""
    timestamps = [_parse_timestamp(r) for r in readings]

    voltages = [float(r.get("voltage", 0)) for r in readings]
    currents = [float(r.get("current_a", 0)) for r in readings]
    speeds = [float(r.get("speed", 0)) for r in readings]

    sv, vr = voltage_ekf.filter_series(voltages, timestamps)
    sc, cr = current_ekf.filter_series(currents, timestamps)
    ss, sr = speed_ekf.filter_series(speeds, timestamps)

    return {
        "smoothed_voltages": sv,
        "smoothed_currents": sc,
        "smoothed_speeds": ss,
        "voltage_rates": vr,
        "current_rates": cr,
        "speed_rates": sr,
        "timestamps": timestamps,
    }


async def broadcast_ws(payload: dict):
    """Broadcast JSON payload to all active WebSocket clients."""
    disconnected = set()
    for ws in list(active_websockets):
        try:
            await ws.send_json(payload)
        except Exception:
            disconnected.add(ws)
    for ws in disconnected:
        active_websockets.discard(ws)


def _execute_pipeline_cycle():
    """Synchronous pipeline execution logic for a single cycle."""
    global _last_seen_at, _latest_cache, _last_cycle_timestamp, _last_cycle_error
    global _last_ml_prediction_time_ms, _last_gemini_call_status, _last_gemini_call_time_ms, _last_openchargemap_call_status

    # Step 1: Fetch recent readings
    readings = fetch_recent_history(cfg.HISTORY_WINDOW)
    if not readings or len(readings) < 2:
        return None

    newest_at = readings[-1].get("updated_at") or readings[-1].get("created_at")
    if newest_at and newest_at == _last_seen_at and _latest_cache is not None:
        # No new data, return cached result
        return _latest_cache
    _last_seen_at = newest_at

    latest = readings[-1]

    # Step 2: EKF filtering
    ekf_result = _run_ekf_on_readings(readings)
    fv = ekf_result["smoothed_voltages"][-1]
    fc = ekf_result["smoothed_currents"][-1]
    fs = ekf_result["smoothed_speeds"][-1]
    vr = ekf_result["voltage_rates"][-1]
    cr = ekf_result["current_rates"][-1]
    sr = ekf_result["speed_rates"][-1]

    # Step 3: Alert analysis
    try:
        alert_info = analyze_alerts(fv, vr, fc, cr, fs, sr)
    except Exception as e:
        alert_info = {"alert_flag": "none", "alert_message": f"Alert engine error: {e}"}

    # Step 4: ML degradation prediction
    degradation_info = None
    try:
        latest_range = latest.get("range_km")
        if latest_range is not None:
            latest_range = float(latest_range)

        t_ml_start = time.perf_counter()
        degradation_info = predict_degradation(
            voltage_series=ekf_result["smoothed_voltages"],
            current_series=ekf_result["smoothed_currents"],
            speed_series=ekf_result["smoothed_speeds"],
            timestamp_series=ekf_result["timestamps"],
            latest_range_km=latest_range,
        )
        _last_ml_prediction_time_ms = round((time.perf_counter() - t_ml_start) * 1000, 2)
    except Exception as e:
        _last_ml_prediction_time_ms = None
        print(f"  🧠 ML prediction failed: {e}")

    # Step 5: Charging lookup (Disabled for prototype — fixed pack)
    station_info = None
    adjusted_range = degradation_info.get("adjusted_range_km") if degradation_info else None
    _last_openchargemap_call_status = "disabled"

    # Step 6: JARVIS LLM message
    jarvis_message = "JARVIS is momentarily unavailable. Monitoring continues."
    t_g_start = time.perf_counter()
    try:
        jarvis_message = get_jarvis_message(
            vehicle_data=latest,
            alert_info=alert_info,
            degradation_info=degradation_info,
            station_info=None,
        )
        _last_gemini_call_time_ms = round((time.perf_counter() - t_g_start) * 1000, 2)
        if jarvis_message and "momentarily unavailable" not in jarvis_message:
            _last_gemini_call_status = "success"
        else:
            _last_gemini_call_status = "failed"
    except Exception as e:
        _last_gemini_call_time_ms = round((time.perf_counter() - t_g_start) * 1000, 2)
        _last_gemini_call_status = "failed"
        print(f"  🤖 JARVIS failed: {e}")

    # Step 7: Write insight to Supabase
    try:
        write_insight({
            "alert_flag":          alert_info["alert_flag"],
            "alert_message":       alert_info["alert_message"],
            "degradation_percent": degradation_info["degradation_percent"] if degradation_info else None,
            "confidence":          degradation_info["confidence"] if degradation_info else None,
            "primary_factor":      degradation_info["primary_factor"] if degradation_info else None,
            "adjusted_range_km":   adjusted_range,
            "station_name":        None,
            "station_distance_km": None,
            "station_address":     None,
            "jarvis_message":      jarvis_message,
            "vehicle_snapshot":    latest,
            "trend_window":        readings,
        })
    except Exception as e:
        print(f"  💾 Insight write failed: {e}")

    # Build cache payload with calibrated display metrics (Capacity %, Runtime s, Range km)
    now_iso = datetime.now(timezone.utc).isoformat()
    raw_v = latest.get("voltage", 0)
    norm_v = cfg.normalize_pack_voltage(raw_v)
    volt = norm_v if norm_v is not None else (float(raw_v) if raw_v else 10.5)
    raw_rem_wh = float(latest.get("remaining_wh", 0))
    pow_w = float(latest.get("power_w", 0))
    speed = float(latest.get("speed", 0))

    v_full = getattr(cfg, "PACK_V_FULL", 10.6)
    v_empty = getattr(cfg, "PACK_V_EMPTY", 8.4)
    tot_wh = getattr(cfg, "BATTERY_ENERGY_WH", 25.0)

    # Derive State-of-Charge (Capacity %) directly from pack voltage (Voltage * 10)
    if volt > 0:
        bat_pct = round(min(100.0, max(0.0, volt * 10.0)), 1)
    else:
        bat_pct = 0.0
    cap_pct = bat_pct
    tot_wh = getattr(cfg, "BATTERY_ENERGY_WH", 25.0)
    rem_wh = round((cap_pct / 100.0) * tot_wh, 2)

    # Calibrated runtime based on voltage (9-10V: 8 min, 8V: 7 min, 7V: 7 min, 6V: 6 min, 5V: 5 min, 4V: 4 min)
    if volt >= 9.0:
        runtime_s = 480.0
    elif volt >= 8.0:
        runtime_s = 420.0
    elif volt >= 7.0:
        runtime_s = 420.0
    elif volt >= 6.0:
        runtime_s = 360.0
    elif volt >= 5.0:
        runtime_s = 300.0
    elif volt >= 4.0:
        runtime_s = 240.0
    else:
        runtime_s = round(max(0.0, volt * 60.0), 1)

    # Calibrate range (km) using capacity percentage (10V/100% = 1.50 km)
    calc_range = round((cap_pct / 100.0) * 1.5, 2)

    latest["capacity_remaining_percent"] = cap_pct
    latest["estimated_runtime_seconds"] = runtime_s
    latest["remaining_wh"] = rem_wh
    latest["range_km"] = calc_range

    cache_payload = {
        "timestamp": now_iso,
        "speed": float(latest.get("speed", 0)),
        "voltage": volt,
        "current_a": float(latest.get("current_a", 0)),
        "range_km": calc_range,
        "adjusted_range_km": round(calc_range * (1.0 - (degradation_info["degradation_percent"] / 100.0 if degradation_info else 0.0)), 2),
        "baseline_range_km": calc_range,
        "battery_pct": bat_pct,
        "capacity_remaining_percent": cap_pct,
        "estimated_runtime_seconds": runtime_s,
        "degradation_percent": degradation_info["degradation_percent"] if degradation_info else None,
        "confidence": degradation_info["confidence"] if degradation_info else None,
        "primary_factor": degradation_info["primary_factor"] if degradation_info else None,
        "range_factors": degradation_info.get("range_factors", {}) if degradation_info else {},
        "vehicle": {
            "speed": float(latest.get("speed", 0)),
            "rpm": float(latest.get("rpm", 0)),
            "distance_m": float(latest.get("distance_m", 0)),
            "voltage": float(latest.get("voltage", 0)),
            "current_a": float(latest.get("current_a", 0)),
            "power_w": float(latest.get("power_w", 0)),
            "energy_wh": float(latest.get("energy_wh", 0)),
            "energy_per_km": float(latest.get("energy_per_km", 0)),
            "remaining_wh": rem_wh,
            "range_km": calc_range,
            "capacity_remaining_percent": cap_pct,
            "estimated_runtime_seconds": runtime_s,
            "gradient": float(latest.get("gradient", 0)),
            "tilt": float(latest.get("tilt", 0)),
        },
        "filtered": {
            "voltage": float(fv),
            "voltage_rate": float(vr),
            "current": float(fc),
            "current_rate": float(cr),
            "speed": float(fs),
            "speed_rate": float(sr),
        },
        "prediction": {
            "degradation_percent": degradation_info["degradation_percent"] if degradation_info else None,
            "confidence": degradation_info["confidence"] if degradation_info else None,
            "primary_factor": degradation_info["primary_factor"] if degradation_info else None,
            "baseline_range_km": degradation_info.get("baseline_range_km") if degradation_info else float(latest.get("range_km", 0)),
            "adjusted_range_km": adjusted_range,
            "range_factors": degradation_info.get("range_factors", {}) if degradation_info else {},
        },
        "alert": {
            "alert_flag": alert_info["alert_flag"],
            "alert_message": alert_info["alert_message"],
            "severity": derive_severity(alert_info["alert_flag"]),
            "priority": derive_priority(derive_severity(alert_info["alert_flag"])),
            "driver_visible": derive_driver_visible(derive_severity(alert_info["alert_flag"])),
        },
        "charging_station": None,
        "jarvis_message": jarvis_message,
    }

    _latest_cache = cache_payload
    _last_cycle_timestamp = now_iso
    _last_cycle_error = None
    return cache_payload


async def _background_loop():
    """Async background task that runs the pipeline continuously."""
    global _loop_running, _last_cycle_error
    _loop_running = True
    print("🚀 Background telemetry processing loop started.")

    while _loop_running:
        try:
            # Run pipeline in thread pool to avoid blocking asyncio event loop
            payload = await asyncio.to_thread(_execute_pipeline_cycle)
            if payload:
                await broadcast_ws(payload)
        except Exception as e:
            _last_cycle_error = str(e)
            print(f"⚠️ Background loop error: {e}")

        await asyncio.sleep(cfg.POLL_INTERVAL_S)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for managing background loop startup and shutdown."""
    global _background_task, _loop_running
    mqtt_ingest.start_mqtt_ingest()
    _background_task = asyncio.create_task(_background_loop())
    yield
    _loop_running = False
    if _background_task:
        _background_task.cancel()
        try:
            await _background_task
        except asyncio.CancelledError:
            pass
    mqtt_ingest.stop_mqtt_ingest()
    print("🛑 Background loop stopped.")


# ── FastAPI App Instance ───────────────────────────────────────────────
app = FastAPI(
    title="AURA EV Co-Pilot API",
    description="Backend API for EV Range Prediction, EKF Alert Analysis, and JARVIS AI Co-Pilot",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── API Endpoints ───────────────────────────────────────────────────────
@app.get("/latest")
def get_latest():
    """Returns the most recent complete cycle's output combining telemetry + insights."""
    if _latest_cache is None:
        return {"status": "warming_up"}
    return _latest_cache


@app.get("/history")
def get_history(limit: int = Query(default=20, ge=1, le=200)):
    """Returns the last N insights rows for charting trends (oldest to newest)."""
    rows = fetch_recent_insights(limit=limit)
    history = []
    for r in rows:
        flag = r.get("alert_flag", "none")
        history.append({
            "timestamp": r.get("created_at"),
            "prediction": {
                "degradation_percent": r.get("degradation_percent"),
                "confidence": r.get("confidence"),
                "primary_factor": r.get("primary_factor"),
                "adjusted_range_km": r.get("adjusted_range_km"),
            },
            "alert": {
                "alert_flag": flag,
                "alert_message": r.get("alert_message", ""),
                "severity": derive_severity(flag),
                "priority": derive_priority(derive_severity(flag)),
                "driver_visible": derive_driver_visible(derive_severity(flag)),
            },
            "charging_station": _extract_station(r),
            "jarvis_message": r.get("jarvis_message", ""),
            "vehicle_snapshot": r.get("vehicle_snapshot"),
            "created_at": r.get("created_at"),
        })
    return history


@app.get("/alerts")
def get_alerts(
    limit: int = 20,
    severity: Optional[str] = None
):
    """Returns recent active alerts feed with optional severity filter."""
    fetch_limit = 100 if severity else limit
    rows = fetch_recent_alerts(limit=fetch_limit)

    alerts = []
    for idx, r in enumerate(rows):
        flag = r.get("alert_flag", "none")
        sev = derive_severity(flag)

        if severity and isinstance(severity, str) and sev.lower() != severity.lower():
            continue

        snap = r.get("vehicle_snapshot")
        if isinstance(snap, str):
            import json
            try:
                snap = json.loads(snap)
            except Exception:
                snap = {}
        elif not isinstance(snap, dict):
            snap = {}

        has_charging = bool(r.get("station_name")) or bool(r.get("charging_station"))

        alerts.append({
            "id": r.get("id") or (idx + 1),
            "timestamp": r.get("created_at") or datetime.now(timezone.utc).isoformat(),
            "alert_flag": flag,
            "alert_message": r.get("alert_message", ""),
            "severity": sev,
            "priority": derive_priority(sev),
            "driver_visible": derive_driver_visible(sev),
            "jarvis_message": r.get("jarvis_message", ""),
            "degradation_percent": _safe_float(r.get("degradation_percent")),
            "voltage": _safe_float(snap.get("voltage")),
            "current_a": _safe_float(snap.get("current_a")),
            "had_charging_suggestion": has_charging,
        })

        if len(alerts) >= limit:
            break

    return {
        "count": len(alerts),
        "alerts": alerts,
    }


def _safe_float(val, default=0.0) -> float:
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


@app.get("/range-analysis")
def get_range_analysis(limit: int = Query(default=30, ge=1, le=200)):
    """Returns range & prediction analysis trends for Range & Prediction page."""
    rows = fetch_recent_insights(limit=limit)
    if not rows or len(rows) < 3:
        return {"status": "warming_up", "trend": []}

    trend = []
    factor_breakdown = {}

    for r in rows:
        ts = r.get("created_at") or datetime.now(timezone.utc).isoformat()
        snap = r.get("vehicle_snapshot")
        if isinstance(snap, str):
            import json
            try:
                snap = json.loads(snap)
            except Exception:
                snap = {}
        elif not isinstance(snap, dict):
            snap = {}

        baseline_range = _safe_float(snap.get("range_km"))
        adjusted_range = _safe_float(r.get("adjusted_range_km"))
        degrad = _safe_float(r.get("degradation_percent"))
        volts = _safe_float(snap.get("voltage"))
        curr = _safe_float(snap.get("current_a"))

        trend.append({
            "timestamp": ts,
            "baseline_range_km": baseline_range,
            "adjusted_range_km": adjusted_range,
            "degradation_percent": degrad,
            "voltage": volts,
            "current_a": curr,
        })

        factor = r.get("primary_factor")
        if factor:
            factor_breakdown[factor] = factor_breakdown.get(factor, 0) + 1

    latest_row = rows[-1]
    latest_snap = latest_row.get("vehicle_snapshot")
    if isinstance(latest_snap, str):
        import json
        try:
            latest_snap = json.loads(latest_snap)
        except Exception:
            latest_snap = {}
    elif not isinstance(latest_snap, dict):
        latest_snap = {}

    latest_baseline = _safe_float(
        latest_snap.get("range_km"),
        default=_safe_float(_latest_cache.get("vehicle", {}).get("range_km") if _latest_cache else None)
    )

    current = {
        "baseline_range_km": latest_baseline,
        "adjusted_range_km": _safe_float(latest_row.get("adjusted_range_km")),
        "degradation_percent": _safe_float(latest_row.get("degradation_percent")),
        "confidence": str(latest_row.get("confidence") or "N/A"),
        "primary_factor": str(latest_row.get("primary_factor") or "N/A"),
        "range_factors": _latest_cache.get("prediction", {}).get("range_factors", {}) if _latest_cache else {},
    }

    session_start = trend[0]["timestamp"] if trend else datetime.now(timezone.utc).isoformat()

    return {
        "session_start": session_start,
        "current": current,
        "trend": trend,
        "factor_breakdown": factor_breakdown,
    }


def _extract_station(r: dict) -> dict | None:
    name = r.get("station_name")
    dist = _safe_float(r.get("station_distance_km"))
    if name:
        return {
            "station_id": f"station-{(abs(hash(name)) % 10000)}",
            "station_name": name,
            "station_distance_km": dist,
            "station_address": r.get("station_address") or "Address unavailable",
            "station_lat": round(cfg.FIXED_LAT, 4),
            "station_lon": round(cfg.FIXED_LON, 4),
            "eta_seconds": int(round((dist / 30.0) * 3600)) if dist > 0 else 0,
        }
    cs = r.get("charging_station")
    if isinstance(cs, dict) and (cs.get("name") or cs.get("station_name")):
        st_name = cs.get("name") or cs.get("station_name")
        st_dist = _safe_float(cs.get("distance_km") or cs.get("station_distance_km"))
        return {
            "station_id": cs.get("station_id") or f"station-{(abs(hash(st_name)) % 10000)}",
            "station_name": st_name,
            "station_distance_km": st_dist,
            "station_address": cs.get("address") or cs.get("station_address") or "Address unavailable",
            "station_lat": _safe_float(cs.get("station_lat"), default=round(cfg.FIXED_LAT, 4)),
            "station_lon": _safe_float(cs.get("station_lon"), default=round(cfg.FIXED_LON, 4)),
            "eta_seconds": int(cs.get("eta_seconds", round((st_dist / 30.0) * 3600))),
        }
    return None





@app.get("/diagnostics")
def get_diagnostics():
    """Returns detailed system diagnostics, raw vs EKF telemetry, and pipeline health."""
    uptime = round(time.time() - _server_start_time, 2)

    import ml_predictor
    ml_loaded = bool(getattr(ml_predictor, "_model", None) is not None)

    import supabase_client
    sb_connected = bool(getattr(supabase_client, "_last_fetch_success", False))

    veh = _latest_cache.get("vehicle", {}) if _latest_cache else {}
    filt = _latest_cache.get("filtered", {}) if _latest_cache else {}

    raw_vs_filtered = {
        "voltage": {
            "raw": _safe_float(veh.get("voltage")),
            "filtered": _safe_float(filt.get("voltage")),
            "rate": _safe_float(filt.get("voltage_rate")),
        },
        "current_a": {
            "raw": _safe_float(veh.get("current_a")),
            "filtered": _safe_float(filt.get("current")),
            "rate": _safe_float(filt.get("current_rate")),
        },
        "speed": {
            "raw": _safe_float(veh.get("speed")),
            "filtered": _safe_float(filt.get("speed")),
            "rate": _safe_float(filt.get("speed_rate")),
        },
    }

    return {
        "backend_health": {
            "status": "ok",
            "background_loop_running": _loop_running,
            "last_cycle_timestamp": _last_cycle_timestamp,
            "last_cycle_error": _last_cycle_error,
            "cycle_interval_seconds": float(cfg.POLL_INTERVAL_S),
            "uptime_seconds": uptime,
        },
        "raw_vs_filtered": raw_vs_filtered,
        "pipeline_status": {
            "supabase_connected": sb_connected,
            "ml_model_loaded": ml_loaded,
            "mqtt_connected": mqtt_ingest.is_mqtt_connected(),
            "last_mqtt_message_timestamp": mqtt_ingest.get_last_mqtt_message_timestamp(),
            "last_ml_prediction_time_ms": _last_ml_prediction_time_ms,
            "last_gemini_call_status": _last_gemini_call_status,
            "last_gemini_call_time_ms": _last_gemini_call_time_ms,
            "last_openchargemap_call_status": _last_openchargemap_call_status,
        },
        "external_services": {
            "gemini_model": getattr(cfg, "GEMINI_MODEL", "gemini-3.5-flash"),
            "elevenlabs_configured": bool(cfg.ELEVENLABS_API_KEY),
        },
    }


# ── TTS Proxy Endpoint ──────────────────────────────────────────────────
class TTSRequest(BaseModel):
    text: str


@app.post("/tts")
async def text_to_speech(req: TTSRequest):
    """Proxy ElevenLabs TTS with character alignment timestamps."""
    if not cfg.ELEVENLABS_API_KEY:
        return {
            "audio_base64": None,
            "alignment": None,
            "error": "ELEVENLABS_API_KEY is not configured",
        }

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{cfg.ELEVENLABS_VOICE_ID}/with-timestamps"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "xi-api-key": cfg.ELEVENLABS_API_KEY,
    }
    body = {
        "text": req.text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body, headers=headers)

        if resp.status_code != 200:
            err_detail = resp.text[:200] if resp.text else f"ElevenLabs API error HTTP {resp.status_code}"
            print(f"  ⚠️  [TTS] ElevenLabs API error HTTP {resp.status_code}: {err_detail}")
            return {
                "audio_base64": None,
                "alignment": None,
                "error": err_detail,
            }

        data = resp.json()
        audio_b64 = data.get("audio_base64") or data.get("audio_base_64")
        align_raw = data.get("alignment") or data.get("normalized_alignment") or {}

        alignment = {
            "characters": align_raw.get("characters", []),
            "character_start_times_seconds": align_raw.get("character_start_times_seconds", []),
            "character_end_times_seconds": align_raw.get("character_end_times_seconds", []),
        }

        return {
            "audio_base64": audio_b64,
            "alignment": alignment,
            "error": None,
        }

    except httpx.TimeoutException:
        return {
            "audio_base64": None,
            "alignment": None,
            "error": "ElevenLabs API request timed out (30s)",
        }
    except Exception as e:
        print(f"  🔊 TTS timestamp proxy error: {e}")
        return {
            "audio_base64": None,
            "alignment": None,
            "error": str(e),
        }


@app.get("/health")
def get_health():
    """Returns background loop and server health status."""
    return {
        "status": "ok",
        "background_loop_running": _loop_running,
        "last_cycle_timestamp": _last_cycle_timestamp,
        "last_cycle_error": _last_cycle_error,
    }


@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    """WebSocket endpoint pushing live cycle updates on each completion."""
    await websocket.accept()
    active_websockets.add(websocket)
    try:
        if _latest_cache is not None:
            await websocket.send_json(_latest_cache)
        else:
            await websocket.send_json({"status": "warming_up"})

        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        active_websockets.discard(websocket)



# ── Server Runner ───────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
