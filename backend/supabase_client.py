"""
supabase_client.py — Supabase client singleton + read/write helpers.

Exports:
    fetch_recent_history(n)  — last n rows from history_data (oldest-first)
    write_insight(insight)   — insert one row into the insights table
"""

from supabase import create_client
import config as cfg

import time
from datetime import datetime, timezone
from supabase import create_client
import config as cfg

# ── Singleton client ──────────────────────────────────────────────────
_client = None
try:
    _client = create_client(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_KEY)
except Exception as _e:
    print(f"⚠️  Supabase client initialization warning: {_e}")


def _generate_synthetic_history(n: int) -> list[dict]:
    """Generate n realistic telemetry rows for offline console verification."""
    now = time.time()
    rows = []
    for i in range(n):
        t = now - (n - 1 - i) * 3
        dt_str = datetime.fromtimestamp(t, tz=timezone.utc).isoformat()
        rows.append({
            "id": i + 1,
            "speed": 42.0 + (i * 0.5),
            "rpm": 1200 + (i * 15),
            "distance_m": 1500.0 + (i * 35.0),
            "voltage": 44.5 - (i * 0.35),   # sag pattern
            "current_a": 25.0 + (i * 2.8),  # rising current
            "power_w": (44.5 - (i * 0.35)) * (25.0 + (i * 2.8)),
            "energy_wh": 120.0 + (i * 2.5),
            "energy_per_km": 85.0 + (i * 1.2),
            "remaining_wh": 480.0 - (i * 2.5),
            "range_km": max(0.5, 1.8 - (i * 0.1)), # drops below 2.0 km to trigger low range
            "gradient": 2.5,
            "tilt": 1.0,
            "created_at": dt_str,
        })
    return rows


_last_fetch_success: bool = False


def fetch_recent_history(n: int = cfg.HISTORY_WINDOW) -> list[dict]:
    """
    Fetch the most recent `n` rows from history_data, returned oldest-first.
    Falls back to synthetic telemetry if Supabase is unreachable or empty.
    """
    global _last_fetch_success
    if _client is not None:
        try:
            response = (
                _client.table("history_data")
                .select("*")
                .order("id", desc=True)
                .limit(n)
                .execute()
            )
            rows = response.data or []
            if rows:
                _last_fetch_success = True
                rows.reverse()  # oldest-first
                return rows
        except Exception as e:
            _last_fetch_success = False
            print(f"  ⚠️  Supabase fetch warning: {e} — using simulation data.")

    _last_fetch_success = False
    return _generate_synthetic_history(n)


_insights_memory: list[dict] = []


def write_insight(insight: dict) -> dict | None:
    """
    Insert a single insight row into the `insights` table.
    """
    if "created_at" not in insight:
        insight["created_at"] = datetime.now(timezone.utc).isoformat()
    _insights_memory.append(insight)
    if len(_insights_memory) > 200:
        _insights_memory.pop(0)

    if _client is not None:
        try:
            response = (
                _client.table("insights")
                .insert({
                    "alert_flag":          insight.get("alert_flag", "none"),
                    "alert_message":       insight.get("alert_message", ""),
                    "degradation_percent": insight.get("degradation_percent"),
                    "confidence":          insight.get("confidence"),
                    "primary_factor":      insight.get("primary_factor"),
                    "adjusted_range_km":   insight.get("adjusted_range_km"),
                    "station_name":        insight.get("station_name"),
                    "station_distance_km": insight.get("station_distance_km"),
                    "station_address":     insight.get("station_address"),
                    "jarvis_message":      insight.get("jarvis_message", ""),
                    "vehicle_snapshot":    insight.get("vehicle_snapshot"),
                    "trend_window":        insight.get("trend_window"),
                })
                .execute()
            )
            rows = response.data
            return rows[0] if rows else insight
        except Exception as e:
            print(f"  ⚠️  Supabase insert warning: {e}")

    print("💾 Simulated insight write successful.")
    return insight


def fetch_recent_insights(limit: int = 20) -> list[dict]:
    """
    Fetch the last `limit` rows from `insights`, ordered oldest to newest.
    """
    if _client is not None:
        try:
            response = (
                _client.table("insights")
                .select("*")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            rows = response.data or []
            if rows:
                rows.reverse()  # oldest to newest
                return rows
        except Exception as e:
            print(f"  ⚠️  Supabase fetch_recent_insights warning: {e}")

    return _insights_memory[-limit:]


def fetch_recent_alerts(limit: int = 100) -> list[dict]:
    """
    Fetch the last `limit` rows from `insights` where alert_flag != 'none', ordered newest to oldest.
    """
    if _client is not None:
        try:
            response = (
                _client.table("insights")
                .select("*")
                .neq("alert_flag", "none")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            rows = response.data or []
            if rows:
                return rows
        except Exception as e:
            print(f"  ⚠️  Supabase fetch_recent_alerts warning: {e}")

    # Fallback to in-memory insights buffer (newest to oldest)
    alerts = [
        r for r in reversed(_insights_memory)
        if r.get("alert_flag") and r.get("alert_flag") != "none"
    ]
    return alerts[:limit]


def update_live_data(telemetry: dict) -> dict | None:
    """
    UPSERT live_data WHERE id=1
    Overwrites/upserts the single live telemetry record (same as Node-RED live path).
    """
    if _client is not None:
        try:
            payload = {k: v for k, v in telemetry.items() if v is not None and k != "created_at"}
            payload["id"] = 1
            payload["updated_at"] = datetime.now(timezone.utc).isoformat()
            res = _client.table("live_data").upsert(payload).execute()
            return res.data[0] if res.data else {"id": 1}
        except Exception as e:
            print(f"  ⚠️  Supabase live_data upsert warning: {e}")
            import traceback
            traceback.print_exc()
            return None
    return {"id": 1}


def insert_history_data(telemetry: dict) -> dict | None:
    """
    INSERT INTO history_data (...)
    Appends a new telemetry record for history tracking (same as Node-RED history path).
    Returns inserted row data including generated row ID and created_at timestamp.
    """
    if _client is not None:
        try:
            payload = {k: v for k, v in telemetry.items() if v is not None}
            if "created_at" not in payload:
                payload["created_at"] = datetime.now(timezone.utc).isoformat()
            res = _client.table("history_data").insert(payload).execute()
            if res.data:
                return res.data[0]
            return payload
        except Exception as e:
            print(f"  ⚠️  Supabase history_data insert warning: {e}")
            import traceback
            traceback.print_exc()
            return None
    return None



