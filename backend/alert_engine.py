"""
alert_engine.py — Rule-based alert engine operating on EKF-filtered values.

Compares EKF-smoothed values and their estimated rates of change to
detect battery stress conditions. All thresholds operate on filtered
(not raw) sensor data, which eliminates false positives from ADC noise.

Priority order:
    1. thermal_stress_indicator — voltage sagging while current rises
    2. unusual_power_draw       — current rising with flat speed
    3. low_battery              — absolute voltage threshold
    4. none                     — all clear

Export:
    analyze_alerts(filtered_voltage, voltage_rate,
                   filtered_current, current_rate,
                   filtered_speed, speed_rate) → dict
"""

import config as cfg

# ── Thresholds (Configurable via config.py) ──
VOLTAGE_RATE_THRESHOLD   = -0.035  # V/s  — voltage falling faster than this
CURRENT_RATE_THRESHOLD   =  0.05   # A/s  — current rising faster than this
HIGH_CURRENT_RATE        =  0.08   # A/s  — current rise for unusual power draw
SPEED_RATE_THRESHOLD     =  0.2    # km/h/s — speed change considered "flat"
LOW_VOLTAGE_CUTOFF       =  getattr(cfg, "LOW_VOLTAGE_CUTOFF", 9.0)  # V — low battery cutoff threshold


def analyze_alerts(
    filtered_voltage: float,
    voltage_rate: float,
    filtered_current: float,
    current_rate: float,
    filtered_speed: float,
    speed_rate: float,
) -> dict:
    """
    Evaluate alert conditions using EKF-filtered values and rates.

    Args:
        filtered_voltage:  smoothed voltage estimate (V)
        voltage_rate:      voltage rate of change (V/s, negative = dropping)
        filtered_current:  smoothed current estimate (A)
        current_rate:      current rate of change (A/s, positive = rising)
        filtered_speed:    smoothed speed estimate (km/h)
        speed_rate:        speed rate of change (km/h/s)

    Returns:
        { "alert_flag": str, "alert_message": str }
    """

    # ── Priority 1: Thermal stress indicator ──────────────────────────
    if voltage_rate < VOLTAGE_RATE_THRESHOLD and current_rate > CURRENT_RATE_THRESHOLD:
        return {
            "alert_flag": "thermal_stress_indicator",
            "alert_message": (
                f"Filtered voltage dropping at {voltage_rate:.4f} V/s "
                f"(smoothed: {filtered_voltage:.2f}V) while current rising at "
                f"{current_rate:.4f} A/s (smoothed: {filtered_current:.2f}A) — "
                f"possible rising internal resistance indicating battery stress."
            ),
        }

    # ── Priority 2: Unusual power draw ────────────────────────────────
    if current_rate > HIGH_CURRENT_RATE and abs(speed_rate) < SPEED_RATE_THRESHOLD:
        return {
            "alert_flag": "unusual_power_draw",
            "alert_message": (
                f"Filtered current rising at {current_rate:.4f} A/s "
                f"(smoothed: {filtered_current:.2f}A) but speed barely changing "
                f"(rate: {speed_rate:.4f} km/h/s, smoothed: {filtered_speed:.1f} km/h) — "
                f"unusual power draw detected; possible motor or drivetrain issue."
            ),
        }

    # ── Priority 3: Low battery ───────────────────────────────────────
    if filtered_voltage < LOW_VOLTAGE_CUTOFF:
        return {
            "alert_flag": "low_battery",
            "alert_message": (
                f"Filtered battery voltage critically low at {filtered_voltage:.2f}V "
                f"(threshold: {LOW_VOLTAGE_CUTOFF}V, rate: {voltage_rate:.4f} V/s)."
            ),
        }

    # ── All clear ─────────────────────────────────────────────────────
    return {
        "alert_flag": "none",
        "alert_message": (
            f"All systems nominal. Filtered voltage: {filtered_voltage:.2f}V "
            f"({voltage_rate:+.4f} V/s), current: {filtered_current:.2f}A "
            f"({current_rate:+.4f} A/s), speed: {filtered_speed:.1f} km/h."
        ),
    }
