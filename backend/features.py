"""
features.py
Shared feature-engineering logic for Block 4 (EV degradation model).

IMPORTANT: this module is imported by BOTH train.py and app.py so that
training-time features and inference-time features can never drift apart.

All features are RATE-OF-CHANGE / RATIO based, per the project spec:
we never feed raw absolute voltage/current into the model, because the
source data used to train the "shape" of degradation behaviour is not
on the same voltage/capacity scale as the 11.1V/2.2Ah pack. Ratios and
per-second rates are scale-invariant (or close to it), so they transfer.

Pack constants below are for the 3S Li-ion pack described in the project
(11.1V nominal, 2.2Ah). Adjust PACK_V_FULL / PACK_V_EMPTY / PACK_CAPACITY_AH
if the actual cell chemistry/count differs.
"""

import numpy as np

import config as cfg

# ---- Pack constants (Configured via config.py) ----
PACK_V_FULL = getattr(cfg, "PACK_V_FULL", 10.6)
PACK_V_EMPTY = getattr(cfg, "PACK_V_EMPTY", 8.4)
PACK_V_RANGE = max(0.5, PACK_V_FULL - PACK_V_EMPTY)
PACK_CAPACITY_AH = 2.2

EPS = 1e-6

FEATURE_NAMES = [
    "voltage_sag_rate",
    "voltage_drop_pct",
    "current_spike_ratio",
    "resistance_proxy",
    "voltage_cv",
    "current_cv",
    "speed_cv",
    "dod_rate_pct_per_s",
    "c_rate",
    "speed_current_corr",
]


def _slope(t, y):
    """Least-squares slope of y vs t. Falls back to simple diff if t has no spread."""
    t = np.asarray(t, dtype=float)
    y = np.asarray(y, dtype=float)
    if len(t) < 2:
        return 0.0
    if np.ptp(t) < EPS:
        # timestamps didn't move (e.g. same-second readings) - use index instead
        t = np.arange(len(y), dtype=float)
    A = np.vstack([t, np.ones_like(t)]).T
    slope, _ = np.linalg.lstsq(A, y, rcond=None)[0]
    return float(slope)


def _coeff_variation(x):
    x = np.asarray(x, dtype=float)
    m = np.mean(x)
    if abs(m) < EPS:
        return 0.0
    return float(np.std(x) / abs(m))


def engineer_features(voltage_series, current_series, speed_series, timestamp_series):
    """
    Build the fixed-length feature vector from a raw reading window.

    All four input lists must be the same length (N >= 2 recommended;
    N == 1 degrades gracefully to zeros/neutral ratios).
    Returns: dict of {feature_name: value}, in FEATURE_NAMES order.
    """
    v = np.asarray(voltage_series, dtype=float)
    i = np.asarray(current_series, dtype=float)
    s = np.asarray(speed_series, dtype=float)
    t = np.asarray(timestamp_series, dtype=float)

    n = len(v)
    if n < 2:
        # not enough history to compute rates - return neutral/zero vector
        return {name: 0.0 for name in FEATURE_NAMES}

    # normalize timestamps to seconds-elapsed if they look like ms epoch
    if np.median(t) > 1e12:
        t = t / 1000.0

    dt_mean = max(np.mean(np.diff(t)), EPS) if n > 1 else 1.0

    # 1. voltage sag rate (V/s), positive = voltage falling over the window
    v_slope = _slope(t, v)
    voltage_sag_rate = max(-v_slope, 0.0)

    # 2. total voltage drop as % of window-start voltage
    voltage_drop_pct = float((v[0] - v[-1]) / max(v[0], EPS) * 100.0)

    # 3. current spike ratio: latest reading vs rolling baseline (preceding readings)
    baseline_i = np.mean(i[:-1]) if n > 1 else i[0]
    current_spike_ratio = float(i[-1] / max(baseline_i, EPS))

    # 4. resistance proxy: -deltaV/deltaI averaged over steps with meaningful deltaI
    #    (this is the same "voltage sag under load" stress proxy used in Block 3)
    dv = np.diff(v)
    di = np.diff(i)
    valid = np.abs(di) > 0.05  # ignore near-zero current steps (noise dominates)
    if np.any(valid):
        resistance_proxy = float(np.mean(-dv[valid] / di[valid]))
    else:
        resistance_proxy = 0.0
    resistance_proxy = max(resistance_proxy, -5.0)  # clip absurd noise-driven outliers
    resistance_proxy = min(resistance_proxy, 5.0)

    # 5/6/7. volatility (coefficient of variation) of each channel
    voltage_cv = _coeff_variation(v)
    current_cv = _coeff_variation(i)
    speed_cv = _coeff_variation(s)

    # 8. depth-of-discharge rate, normalized to the pack's usable voltage window,
    #    expressed as %/second of pack range consumed
    dod_rate_pct_per_s = float((voltage_sag_rate / PACK_V_RANGE) * 100.0)

    # 9. C-rate: mean current relative to pack capacity (load intensity)
    c_rate = float(np.mean(i) / PACK_CAPACITY_AH)

    # 10. speed vs current correlation: distinguishes "sag because of a genuine
    #     load/acceleration event" (high correlation) from "sag with flat load"
    #     (low/negative correlation -> more likely a degradation signal)
    if np.std(s) > EPS and np.std(i) > EPS:
        speed_current_corr = float(np.corrcoef(s, i)[0, 1])
    else:
        speed_current_corr = 0.0

    return {
        "voltage_sag_rate": voltage_sag_rate,
        "voltage_drop_pct": voltage_drop_pct,
        "current_spike_ratio": current_spike_ratio,
        "resistance_proxy": resistance_proxy,
        "voltage_cv": voltage_cv,
        "current_cv": current_cv,
        "speed_cv": speed_cv,
        "dod_rate_pct_per_s": dod_rate_pct_per_s,
        "c_rate": c_rate,
        "speed_current_corr": speed_current_corr,
    }


def features_to_vector(feat_dict):
    """Order a feature dict into the fixed vector the model expects."""
    return [feat_dict[name] for name in FEATURE_NAMES]
