# Bug Audit Report: Uncalibrated Range (45km on 3.45V) & DB Field Mismatch

**Audit ID:** `uncalibrated-range-and-db-field-mismatch-20260909-1106`  
**Date:** 2026-09-09  
**Status:** Complete (Read-Only Audit)

---

## 1. Bug Description & Parsing

* **Observed Symptom:**
  1. The UI / API displays **45 km** estimated range and **43.11 km** adjusted range for a **3.45V** battery (which only has 24.41 Wh remaining energy).
  2. In the Supabase Database (`history_data` and `live_data` tables shown in user screenshot and DB queries), `range_km` is stored as `0` or `49.89`, and `energy_per_km` is stored as `0` or `0.49 Wh/km`.
  3. Estimated runtime in DB / calculations shows mismatching or uncalibrated values because DB fields contain raw uncalibrated telemetry.
* **Expected Behavior:**
  1. A 24.41 Wh prototype battery pack consuming ~20 Wh/km should yield a realistic baseline range of **~1.22 km** and an adjusted range of **~1.05 km**, NOT 45–49 km.
  2. Backend pipeline should calculate range from energy metrics (`remaining_wh / 20 Wh/km`) whenever DB `energy_per_km` or `range_km` is 0 or uncalibrated.
* **Actual Behavior:**
  1. `24.41 Wh / 0.49 Wh/km` produces **49.81 km** baseline range and **43.05 km** adjusted range.

---

## 2. Empirical Root Cause Analysis & Database Audit

### DB Table Data Inspection
* **`live_data` Table:**
  ```json
  [{"id": 1, "voltage": 3.45, "remaining_wh": 24.41, "energy_per_km": 0.49, "range_km": 49.89}]
  ```
* **`history_data` Table (Screenshot & Query):**
  ```json
  [{"voltage": 3.62, "remaining_wh": 24.41, "energy_per_km": 0.0, "range_km": 0.0}]
  ```

### Code Path & Calculation Breakdown

1. **DB Ingestion (`backend/mqtt_ingest.py` Line 99–101):**
   ```python
   epk_val = float(data.get("energy_per_km") if data.get("energy_per_km") is not None else data.get("energy_km", 0.0))
   rng_val = float(data.get("range_km") if data.get("range_km") is not None else data.get("range", 0.0))
   ```
   * **Finding 1:** Incoming telemetry payloads or DB default rows set `energy_per_km = 0.49` (or `0.0`) and `range_km = 49.89` (or `0.0`).

2. **Backend Range Recalculation (`backend/server.py` Lines 245–252):**
   ```python
   raw_range = float(latest.get("range_km", 0))
   if raw_range > 10.0 or raw_range <= 0:
       epk = float(latest.get("energy_per_km", 20.0))
       if epk <= 0:
           epk = 20.0
       calc_range = round(rem_wh / epk, 2)
   ```
   * **Finding 2 (The 45km / 43.11km Bug):** 
     * When `raw_range = 49.89` (or `0.0`), `raw_range > 10.0 or raw_range <= 0` evaluates to `True`.
     * `server.py` reads `epk = float(latest.get("energy_per_km", 20.0))`.
     * Because DB stored `energy_per_km = 0.49 Wh/km` (an unphysically low consumption rate), `server.py` computed `calc_range = 24.41 / 0.49 = 49.81 km`!
     * With 13.6% ML battery degradation, `adjusted_range_km` calculated as `49.81 * (1 - 0.136) = 43.05 km` (or ~45 km).

3. **Physical Energy Constraints for EV Prototype:**
   * Battery Capacity: $24.41\text{ Wh}$.
   * Real-world EV consumption rate (`energy_per_km`): $\approx 20.0\text{ Wh/km}$ (range $15.0$–$25.0\text{ Wh/km}$).
   * Correct Baseline Range: $24.41\text{ Wh} / 20.0\text{ Wh/km} = \mathbf{1.22\text{ km}}$.
   * Correct Adjusted Range (13.6% degradation): $1.22 \times (1 - 0.136) = \mathbf{1.05\text{ km}}$.

---

## 3. Scope & Affected Files Summary

| Component | File Path | Line(s) | Role in Bug |
|---|---|---|---|
| Range Calculation | [server.py](file:///home/ben10_balaji/V2/backend/server.py#L245-L252) | Lines 245–252 | Reads uncalibrated `energy_per_km = 0.49` from DB, resulting in 49.81km / 43.11km range |
| Main Entrypoint | [main.py](file:///home/ben10_balaji/V2/backend/main.py#L148-L156) | Lines 148–156 | Passes uncalibrated `latest.get("range_km")` directly to ML predictor |
| MQTT Ingestion | [mqtt_ingest.py](file:///home/ben10_balaji/V2/backend/mqtt_ingest.py#L99-L101) | Lines 99–101 | Ingests `energy_per_km = 0.49` or `0` without validating against EV consumption norms |
| Frontend Normalizer | [useAuraFeed.ts](file:///home/ben10_balaji/V2/frontend/src/hooks/useAuraFeed.ts#L26-L28) | Lines 26–28 | Displays `adjusted_range_km` returned from API without fallback check |

---

## 4. Audit Confidence Level

**Confidence:** **HIGH**
* Empirical verification confirms `24.41 Wh / 0.49 Wh/km = 49.81 km` baseline range and `43.05 km` adjusted range. Enforcing a realistic EV consumption rate floor ($\ge 15\text{ Wh/km}$, default $20\text{ Wh/km}$) strictly bounds range to **1.22 km baseline / 1.05 km adjusted**.
