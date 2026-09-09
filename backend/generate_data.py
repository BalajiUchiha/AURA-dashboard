"""
generate_data.py — Data generator for weak battery pack degradation model.

Physics-based synthetic trip generator:
    V_terminal(t) = OCV(SOC(t)) - I(t) * R_internal(SOH)
Reparameterized for a weak ~7.6V nominal pack (8.4V max, 5.5V cutoff) that
starts around 7-8V and sags into 5-6V under load.
"""

import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)

# Pack constants (kept in sync with features.py)
V_FULL = 8.4
V_EMPTY = 5.5
CAPACITY_AH = 2.2
R0 = 0.18          # baseline internal resistance (ohm) of weak pack


def ocv_from_soc(soc):
    """Open-circuit-voltage curve for weak 2S/7.6V pack, soc in [0,1]."""
    return V_EMPTY + (V_FULL - V_EMPTY) * (soc ** 0.75)


def simulate_trip(degradation, n_readings=90, dt=1.0, rng=RNG):
    """
    Simulate one drive-cycle trip for a pack at a given degradation level
    (0.0 = brand new, 0.45 = 45% degraded).
    """
    r_internal = R0 * (1 + 4.5 * degradation)
    capacity_eff = CAPACITY_AH * (1 - 0.7 * degradation)

    soc = rng.uniform(0.70, 0.95)
    speed = rng.uniform(8, 15)
    rows = []
    charge_used_ah = 0.0

    for k in range(n_readings):
        accel_event = rng.random() < 0.12
        if accel_event:
            speed += rng.uniform(2, 6)
        else:
            speed += rng.normal(0, 0.8)
        speed = float(np.clip(speed, 0, 30))

        base_current = 0.6 + 0.09 * speed
        current = base_current * (1 + 0.25 * degradation) + rng.normal(0, 0.05)
        current = float(max(current, 0.05))

        voltage = ocv_from_soc(soc) - current * r_internal + rng.normal(0, 0.015)
        voltage = float(np.clip(voltage, V_EMPTY - 0.3, V_FULL))

        rows.append({
            "t_offset": k * dt,
            "voltage": voltage,
            "current_a": current,
            "speed": speed
        })

        charge_used_ah += current * dt / 3600.0
        soc = max(soc - (current * dt / 3600.0) / max(capacity_eff, 0.1), 0.02)

    df = pd.DataFrame(rows)
    df["degradation_percent"] = degradation * 100.0
    return df


def rng_beta_sample(rng):
    return rng.beta(2, 5) * 0.9


def build_dataset(n_trips=260, n_readings=90):
    frames = []
    for trip_id in range(n_trips):
        degradation = float(np.clip(rng_beta_sample(RNG), 0, 0.45))
        df = simulate_trip(degradation, n_readings=n_readings, rng=RNG)
        df["trip_id"] = trip_id
        frames.append(df)
    full = pd.concat(frames, ignore_index=True)
    return full


if __name__ == "__main__":
    data = build_dataset()
    data.to_csv("synthetic_battery_trips.csv", index=False)
    print(f"Wrote synthetic_battery_trips.csv with {len(data)} readings "
          f"across {data['trip_id'].nunique()} trips.")
    print(data.groupby("trip_id")["degradation_percent"].first().describe())
