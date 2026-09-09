"""
train.py — Model trainer for Block 4 EV degradation predictor.

Builds sliding-window training rows from trip-level readings, engineers
features via features.py (SAME code path app.py uses at inference time),
trains a RandomForestRegressor, and pickles the model + model_metadata.json.

Run: python3 train.py
Produces: degradation_model.pkl, model_metadata.json
"""

import json
import pickle

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupShuffleSplit

from features import FEATURE_NAMES, engineer_features, features_to_vector

WINDOW_SIZES = [6, 10, 15]
STEP = 5


def build_windowed_rows(df, window_sizes=WINDOW_SIZES, step=STEP):
    rows = []
    for trip_id, g in df.groupby("trip_id"):
        g = g.sort_values("t_offset").reset_index(drop=True)
        label = g["degradation_percent"].iloc[0]
        for w in window_sizes:
            for start in range(0, len(g) - w, step):
                window = g.iloc[start:start + w]
                feats = engineer_features(
                    window["voltage"].tolist(),
                    window["current_a"].tolist(),
                    window["speed"].tolist(),
                    window["t_offset"].tolist(),
                )
                vec = features_to_vector(feats)
                rows.append(vec + [label, trip_id])
    cols = FEATURE_NAMES + ["degradation_percent", "trip_id"]
    return pd.DataFrame(rows, columns=cols)


def main():
    raw = pd.read_csv("synthetic_battery_trips.csv")
    print(f"Loaded {len(raw)} raw readings from {raw['trip_id'].nunique()} trips.")

    windowed = build_windowed_rows(raw)
    print(f"Built {len(windowed)} windowed training rows.")

    X = windowed[FEATURE_NAMES].values
    y = windowed["degradation_percent"].values
    groups = windowed["trip_id"].values

    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train_idx, test_idx = next(splitter.split(X, y, groups))
    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    model = RandomForestRegressor(
        n_estimators=250,
        max_depth=10,
        min_samples_leaf=4,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)
    print(f"Test MAE: {mae:.2f} percentage points")
    print(f"Test R^2: {r2:.3f}")

    importances = dict(zip(FEATURE_NAMES, model.feature_importances_.round(4).tolist()))
    print("Feature importances:", json.dumps(importances, indent=2))

    with open("degradation_model.pkl", "wb") as f:
        pickle.dump(model, f)

    metadata = {
        "feature_names": FEATURE_NAMES,
        "test_mae_percentage_points": round(float(mae), 3),
        "test_r2": round(float(r2), 3),
        "feature_importances": importances,
        "n_training_rows": int(len(X_train)),
        "n_test_rows": int(len(X_test)),
        "model_type": "RandomForestRegressor",
        "sklearn_params": model.get_params(),
    }
    with open("model_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2, default=str)

    print("Saved degradation_model.pkl and model_metadata.json cleanly.")


if __name__ == "__main__":
    main()
