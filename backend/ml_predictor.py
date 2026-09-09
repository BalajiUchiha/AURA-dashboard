"""
ml_predictor.py — Local ML degradation model loader & predictor.

Loads the RandomForestRegressor from degradation_model.pkl once at import
time. Uses the EXACT same feature engineering as training by importing
features.py directly (engineer_features + features_to_vector).

Exports:
    predict_degradation(voltage_series, current_series, speed_series,
                        timestamp_series, latest_range_km)
        → { degradation_percent, confidence, primary_factor,
            baseline_range_km, adjusted_range_km }
"""

import json
import os

import joblib
import numpy as np

import config as cfg
from features import engineer_features, features_to_vector, FEATURE_NAMES

# ── Load model & metadata once at startup ─────────────────────────────
_model = None
_metadata = None
_feature_importances = {}

def _load_model():
    """Load the model and metadata files. Called once on first use."""
    global _model, _metadata, _feature_importances

    if not os.path.exists(cfg.MODEL_PKL_PATH):
        print(f"⚠️  Model file not found: {cfg.MODEL_PKL_PATH}")
        return False

    try:
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # suppress sklearn version warning
            _model = joblib.load(cfg.MODEL_PKL_PATH)
        print(f"  🧠 Model loaded: {type(_model).__name__} "
              f"({_model.n_estimators} trees, {_model.n_features_in_} features)")
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        return False

    # Load metadata (optional — degrades gracefully without it)
    if os.path.exists(cfg.MODEL_METADATA_PATH):
        try:
            with open(cfg.MODEL_METADATA_PATH, "r") as f:
                _metadata = json.load(f)
            _feature_importances = _metadata.get("feature_importances", {})
            print(f"  📋 Metadata loaded: MAE={_metadata.get('test_mae_percentage_points')}%, "
                  f"R²={_metadata.get('test_r2')}")
        except Exception as e:
            print(f"  ⚠️  Metadata load failed (non-fatal): {e}")
    else:
        print(f"  ⚠️  Metadata file not found: {cfg.MODEL_METADATA_PATH}")

    return True


# ── Human-readable labels for feature names ───────────────────────────
_FEATURE_LABELS = {
    "voltage_sag_rate":    "Voltage Sag Rate",
    "voltage_drop_pct":    "Voltage Drop %",
    "current_spike_ratio": "Current Spike Ratio",
    "resistance_proxy":    "Internal Resistance",
    "voltage_cv":          "Voltage Variability",
    "current_cv":          "Current Variability",
    "speed_cv":            "Speed Variability",
    "dod_rate_pct_per_s":  "Discharge Rate",
    "c_rate":              "C-Rate (Load Intensity)",
    "speed_current_corr":  "Speed-Current Correlation",
}


def _determine_confidence(feat_dict: dict, n_readings: int) -> str:
    """
    Derive a confidence level based on window length and whether feature
    values look reasonable (not all zeros / not extreme outliers).
    """
    if n_readings < 3:
        return "low"

    # Check if features have meaningful variation (not a flat/zero window)
    values = list(feat_dict.values())
    non_zero_count = sum(1 for v in values if abs(v) > 1e-6)

    if n_readings >= 8 and non_zero_count >= 6:
        return "high"
    elif n_readings >= 5 and non_zero_count >= 4:
        return "medium"
    else:
        return "low"


def _determine_primary_factor(feat_dict: dict) -> str:
    """
    Find the feature with the highest *weighted* contribution for this
    specific input: |feature_value| × global_importance.

    This tells the driver WHY degradation is high/low in plain English.
    """
    if not _feature_importances:
        # Fallback: just use the feature with the largest absolute value
        if feat_dict:
            top = max(feat_dict.items(), key=lambda kv: abs(kv[1]))
            return _FEATURE_LABELS.get(top[0], top[0])
        return "Unknown"

    # Weighted contribution: |value| × importance
    weighted = {}
    for name in FEATURE_NAMES:
        val = abs(feat_dict.get(name, 0.0))
        imp = _feature_importances.get(name, 0.0)
        weighted[name] = val * imp

    top_name = max(weighted, key=weighted.get)
    return _FEATURE_LABELS.get(top_name, top_name)


def predict_degradation(
    voltage_series: list[float],
    current_series: list[float],
    speed_series: list[float],
    timestamp_series: list[float],
    latest_range_km: float | None = None,
) -> dict | None:
    """
    Run the degradation model on a window of EKF-smoothed sensor data.

    Args:
        voltage_series:   smoothed voltage values, oldest-first
        current_series:   smoothed current values, oldest-first
        speed_series:     smoothed speed values, oldest-first
        timestamp_series: epoch seconds, oldest-first
        latest_range_km:  latest range estimate from sensor data (for adjustment)

    Returns:
        dict with keys: degradation_percent, confidence, primary_factor,
                        baseline_range_km, adjusted_range_km
        or None on failure
    """
    global _model

    # Lazy-load model on first call
    if _model is None:
        if not _load_model():
            return None

    try:
        # Build features using the EXACT same logic as training
        feat_dict = engineer_features(
            voltage_series, current_series, speed_series, timestamp_series
        )
        feat_vector = features_to_vector(feat_dict)

        # Predict
        X = np.array([feat_vector])
        degradation_percent = float(_model.predict(X)[0])

        # Clamp to [0, 100] — the model can occasionally predict outside bounds
        degradation_percent = max(0.0, min(100.0, degradation_percent))

        # Derive confidence and primary factor
        confidence = _determine_confidence(feat_dict, len(voltage_series))
        primary_factor = _determine_primary_factor(feat_dict)

        # Adjusted range and loss breakdown per factor
        baseline_range_km = float(latest_range_km) if (latest_range_km is not None and latest_range_km > 0) else 0.0
        adjusted_range_km = None
        range_factors = {}

        if baseline_range_km > 0:
            adjusted_range_km = round(
                baseline_range_km * (1.0 - degradation_percent / 100.0), 2
            )
            loss_km = round(baseline_range_km - adjusted_range_km, 2)

            if loss_km > 0:
                weighted = {}
                for name in FEATURE_NAMES:
                    val = abs(feat_dict.get(name, 0.0))
                    imp = _feature_importances.get(name, 0.1) if _feature_importances else 0.1
                    weighted[name] = val * imp

                total_weight = sum(weighted.values())
                if total_weight > 0:
                    sorted_feats = sorted(weighted.items(), key=lambda kv: kv[1], reverse=True)
                    for name, w in sorted_feats[:3]:
                        share = w / total_weight
                        factor_loss = round(loss_km * share, 1)
                        if factor_loss > 0:
                            label = _FEATURE_LABELS.get(name, name)
                            range_factors[label] = factor_loss

        return {
            "degradation_percent": round(degradation_percent, 2),
            "confidence": confidence,
            "primary_factor": primary_factor,
            "baseline_range_km": round(baseline_range_km, 2) if baseline_range_km > 0 else None,
            "adjusted_range_km": adjusted_range_km,
            "range_factors": range_factors,
        }

    except Exception as e:
        print(f"🧠 ML prediction failed: {e}")
        return None
