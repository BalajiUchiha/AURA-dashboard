"""
test_rate_limiting.py — Rate limiting & throttling test script for AURA backend.

Simulates sustained alert conditions across multiple pipeline cycles to verify:
1. Gemini API is called on Cycle #1 (alert flag changed / initial call).
2. Gemini API calls are throttled (skipped) on subsequent cycles while alert_flag is sustained.
3. Previous jarvis_message is reused when API calls are skipped (frontend doesn't go blank).
4. Gemini API is called again only after JARVIS_MIN_CALL_INTERVAL_SECONDS has elapsed.
"""

import time
import os
from datetime import datetime, timezone

import config as cfg
from jarvis_client import get_jarvis_message, reset_jarvis_state

def run_rate_limiting_test():
    print("=" * 70)
    print("  🚀 AURA Backend Rate Limiting & Throttling Verification Test")
    print("=" * 70)

    # Set min interval for test (e.g. 15 seconds to test cleanly within 45-60s)
    interval = 15
    cfg.JARVIS_MIN_CALL_INTERVAL_SECONDS = interval
    print(f"  Configured JARVIS_MIN_CALL_INTERVAL_SECONDS = {interval}s")
    print(f"  Simulating pipeline cycles every 3 seconds for 50 seconds...\n")

    reset_jarvis_state()

    # Sustained alert payload
    vehicle_data = {
        "speed": 12.0, "voltage": 9.3, "current_a": 1.1, "power_w": 10.23,
        "energy_wh": 50.0, "remaining_wh": 100.0, "range_km": 1.5,
        "gradient": 0.0, "tilt": 0.0
    }
    alert_info = {
        "alert_flag": "low_battery",
        "alert_message": "Filtered battery voltage critically low at 9.30V (threshold: 9.5V)."
    }
    degradation_info = {
        "degradation_percent": 16.0,
        "confidence": "high",
        "primary_factor": "C-Rate (Load Intensity)",
        "adjusted_range_km": 1.26
    }
    station_info = {
        "station_name": "Spencer Plaza FastCharge",
        "station_distance_km": 0.85,
        "station_address": "Anna Salai, Chennai"
    }

    cycle_records = []
    start_time = time.time()

    # Run for ~15 cycles (approx 45-50 seconds)
    total_cycles = 15
    poll_sleep_s = 3

    for cycle in range(1, total_cycles + 1):
        elapsed = time.time() - start_time
        print(f"\n▶ Loop Cycle #{cycle} (t = {elapsed:.1f}s)")
        print(f"  Alert state: {alert_info['alert_flag']}")

        t_start = time.time()
        msg = get_jarvis_message(
            vehicle_data=vehicle_data,
            alert_info=alert_info,
            degradation_info=degradation_info,
            station_info=station_info,
            verbose_log=True
        )
        t_call = time.time() - t_start

        cycle_records.append({
            "cycle": cycle,
            "timestamp": round(elapsed, 1),
            "message": msg,
            "duration": round(t_call, 2)
        })

        if cycle < total_cycles:
            time.sleep(poll_sleep_s)

    print("\n" + "=" * 70)
    print("  📊 RATE LIMITING TEST RESULTS SUMMARY")
    print("=" * 70)

    for rec in cycle_records:
        msg_preview = rec['message'][:60] + "..." if len(rec['message']) > 60 else rec['message']
        print(f"  Cycle #{rec['cycle']:02d} | t={rec['timestamp']:4.1f}s | Message: \"{msg_preview}\"")

    print("=" * 70)

if __name__ == "__main__":
    run_rate_limiting_test()
