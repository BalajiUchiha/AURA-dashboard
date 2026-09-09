"""
main.py — AURA Backend entrypoint (Python).

Main polling loop that runs every POLL_INTERVAL_S seconds:
    1. Fetch recent history_data rows
    2. EKF-filter voltage, current, speed
    3. Analyze trends → produce alert (on filtered values)
    4. ML degradation prediction (on filtered series)
    5. If low_battery or low range → charging station lookup
    6. Call Gemini (JARVIS) for a driver-friendly message
    7. Write insight to Supabase

Each step is independently error-handled — a single failure never
crashes the loop.
"""

import signal
import sys
import time
from datetime import datetime, timezone

import config as cfg
from supabase_client import fetch_recent_history, write_insight
from ekf_filter import voltage_ekf, current_ekf, speed_ekf
from alert_engine import analyze_alerts
from ml_predictor import predict_degradation
from jarvis_client import get_jarvis_message

# ── State ─────────────────────────────────────────────────────────────
_cycle_count = 0
_last_seen_at = None  # track the latest created_at we've processed
_running = True


def _parse_timestamp(row: dict) -> float:
    """Extract a float epoch-seconds timestamp from a row."""
    ts_str = row.get("created_at") or row.get("updated_at")
    if ts_str is None:
        return time.time()
    try:
        # Handle ISO format with timezone (e.g. "2026-09-06T12:00:00+00:00")
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        return dt.timestamp()
    except (ValueError, AttributeError):
        return time.time()


def _run_ekf_on_readings(readings: list[dict]) -> dict:
    """
    Pass a batch of readings through the three EKF instances.

    Returns a dict with:
        smoothed_voltages, smoothed_currents, smoothed_speeds,
        voltage_rates, current_rates, speed_rates,
        timestamps
    """
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


def _run_cycle():
    """Single analysis cycle — called every POLL_INTERVAL_S seconds."""
    global _cycle_count, _last_seen_at
    _cycle_count += 1
    label = f"Cycle #{_cycle_count}"
    print(f"\n── {label} {'─' * 48}")

    # ── Step 1: Fetch recent readings ─────────────────────────────────
    readings = None
    try:
        readings = fetch_recent_history(cfg.HISTORY_WINDOW)
        print(f"  📡 Fetched {len(readings)} history rows.")
    except Exception as e:
        print(f"  ❌ Fetch failed: {e}")
        return

    if not readings or len(readings) < 2:
        print("  ⏳ Not enough data for trend analysis — skipping.")
        return

    # Check if we've already processed this exact window
    newest_at = readings[-1].get("created_at")
    if newest_at and newest_at == _last_seen_at:
        print("  ♻️  No new data since last cycle — skipping.")
        return
    _last_seen_at = newest_at

    latest = readings[-1]

    # ── Step 2: EKF filtering ─────────────────────────────────────────
    ekf_result = None
    try:
        ekf_result = _run_ekf_on_readings(readings)
        fv = ekf_result["smoothed_voltages"][-1]
        fc = ekf_result["smoothed_currents"][-1]
        fs = ekf_result["smoothed_speeds"][-1]
        vr = ekf_result["voltage_rates"][-1]
        cr = ekf_result["current_rates"][-1]
        sr = ekf_result["speed_rates"][-1]
        print(f"  🔬 EKF: V={fv:.2f}V ({vr:+.4f}/s), "
              f"I={fc:.2f}A ({cr:+.4f}/s), "
              f"S={fs:.1f}km/h ({sr:+.4f}/s)")
    except Exception as e:
        print(f"  ❌ EKF filtering failed: {e}")
        return  # can't proceed without filtered values

    # ── Step 3: Alert analysis (on filtered values) ───────────────────
    alert_info = None
    try:
        alert_info = analyze_alerts(fv, vr, fc, cr, fs, sr)
        icon = "✅" if alert_info["alert_flag"] == "none" else "🚨"
        print(f"  {icon} Alert: {alert_info['alert_flag']}")
        if alert_info["alert_flag"] != "none":
            print(f"     {alert_info['alert_message']}")
    except Exception as e:
        print(f"  ❌ Alert analysis failed: {e}")
        alert_info = {"alert_flag": "none", "alert_message": f"Alert engine error: {e}"}

    # ── Step 4: ML degradation prediction ─────────────────────────────
    degradation_info = None
    try:
        latest_range = latest.get("range_km")
        if latest_range is not None:
            latest_range = float(latest_range)
            if latest_range > 10.0 or latest_range <= 0:
                rem_w = float(latest.get("remaining_wh", 0))
                epk = float(latest.get("energy_per_km", 20.0))
                if epk < 15.0 or epk > 100.0:
                    epk = 20.0
                latest_range = round(rem_w / epk, 2) if rem_w > 0 else 0.0

        degradation_info = predict_degradation(
            voltage_series=ekf_result["smoothed_voltages"],
            current_series=ekf_result["smoothed_currents"],
            speed_series=ekf_result["smoothed_speeds"],
            timestamp_series=ekf_result["timestamps"],
            latest_range_km=latest_range,
        )
        if degradation_info:
            print(f"  🧠 Degradation: {degradation_info['degradation_percent']}% "
                  f"(confidence: {degradation_info['confidence']}, "
                  f"factor: {degradation_info['primary_factor']})")
            if degradation_info.get("adjusted_range_km") is not None:
                print(f"     Adjusted range: {degradation_info['adjusted_range_km']} km")
        else:
            print("  ⚠️  ML prediction returned None — model may not be loaded.")
    except Exception as e:
        print(f"  🧠 ML prediction failed: {e}")

    # ── Calculate reframed range metrics (Capacity % and Runtime s) ───
    pow_w = float(latest.get("power_w", 0))
    volt = float(fv)
    v_full = getattr(cfg, "PACK_V_FULL", 10.6)
    v_empty = getattr(cfg, "PACK_V_EMPTY", 8.4)
    tot_wh = getattr(cfg, "BATTERY_ENERGY_WH", 25.0)

    bat_pct = round(min(100.0, max(0.0, ((volt - v_empty) / max(0.1, v_full - v_empty)) * 100.0)), 1) if volt > 0 else 80.0
    cap_pct = bat_pct
    effective_rem_wh = (cap_pct / 100.0) * tot_wh if cap_pct > 0 else 0.0

    if cap_pct <= 0 or effective_rem_wh <= 0:
        runtime_s = 0.0
    elif pow_w >= 0.5:
        raw_runtime_s = (effective_rem_wh / pow_w) * 3600.0
        runtime_s = round(min(14400.0, max(0.0, raw_runtime_s)), 1)
    else:
        runtime_s = round(min(14400.0, (effective_rem_wh / 15.0) * 3600.0), 1)

    latest["capacity_remaining_percent"] = cap_pct
    latest["estimated_runtime_seconds"] = runtime_s
    latest["remaining_wh"] = effective_rem_wh

    # ── Step 5: Charging station lookup (Disabled for prototype) ───────
    station_info = None
    adjusted_range = degradation_info.get("adjusted_range_km") if degradation_info else None

    # ── Step 6: JARVIS LLM message ────────────────────────────────────
    jarvis_message = "JARVIS is momentarily unavailable. Monitoring continues."
    try:
        jarvis_message = get_jarvis_message(
            vehicle_data=latest,
            alert_info=alert_info,
            degradation_info=degradation_info,
            station_info=None,
        )
        print(f'  🤖 JARVIS: "{jarvis_message}"')
    except Exception as e:
        print(f"  🤖 JARVIS failed: {e}")

    # ── Step 7: Persist insight ───────────────────────────────────────
    try:
        row = write_insight({
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
        if row:
            print(f"  💾 Insight saved (id: {row.get('id', '?')}).")
        else:
            print("  💾 Insight write returned None — check logs above.")
    except Exception as e:
        print(f"  💾 Insight write failed: {e}")

    print(f"── {label} complete {'─' * 42}\n")


# ── Graceful shutdown ─────────────────────────────────────────────────
def _shutdown(signum, frame):
    global _running
    sig_name = signal.Signals(signum).name
    print(f"\n🛑 Received {sig_name} — shutting down gracefully...")
    _running = False


signal.signal(signal.SIGINT, _shutdown)
signal.signal(signal.SIGTERM, _shutdown)


# ── Main loop ─────────────────────────────────────────────────────────
def main():
    global _running

    print("")
    print("╔══════════════════════════════════════════════════════════╗")
    print("║   AURA Backend — EV Alert Engine & JARVIS Co-Pilot     ║")
    print("║   Python Edition with EKF + ML Degradation Model       ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print("")
    print(f"  Supabase:    {cfg.SUPABASE_URL}")
    print(f"  Poll every:  {cfg.POLL_INTERVAL_S}s")
    print(f"  History:     last {cfg.HISTORY_WINDOW} readings")
    print(f"  Location:    {cfg.FIXED_LAT}, {cfg.FIXED_LON}")
    print(f"  Model:       {cfg.MODEL_PKL_PATH}")
    print(f"  Low range:   < {cfg.LOW_RANGE_THRESHOLD_KM} km triggers charging lookup")
    print("")

    while _running:
        try:
            _run_cycle()
        except Exception as e:
            # Top-level catch — should never reach here, but just in case
            print(f"\n💥 Unexpected top-level error: {e}")

        # Sleep in small increments to respond quickly to SIGINT
        for _ in range(cfg.POLL_INTERVAL_S * 10):
            if not _running:
                break
            time.sleep(0.1)

    print("✅ AURA Backend stopped.\n")


if __name__ == "__main__":
    main()
