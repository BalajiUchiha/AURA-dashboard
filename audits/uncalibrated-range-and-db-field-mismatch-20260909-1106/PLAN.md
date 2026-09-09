# Bug Fix Implementation Plan: Energy Consumption Calibration & Realistic Range Calculation

**Audit Reference:** `audits/uncalibrated-range-and-db-field-mismatch-20260909-1106/AUDIT.md`  
**Bug ID:** `uncalibrated-range-and-db-field-mismatch`  
**Created:** 2026-09-09  

---

## 1. Problem Summary & Audit Findings

Empirical database queries and code path analysis confirmed:
* **Finding 1 (`backend/server.py`, Lines 245–252):** When `latest.get("range_km")` is 0 or >10km, `server.py` attempts to recalculate range using `epk = float(latest.get("energy_per_km", 20.0))`. Because DB contains `energy_per_km = 0.49` (or `0.0`), `24.41 Wh / 0.49 Wh/km` produces an unphysical baseline range of **49.81 km** and an adjusted range of **43.05 km** (~45 km) for a 3.45V (24.41 Wh) battery!
* **Finding 2 (`backend/mqtt_ingest.py`, Lines 99–101):** Ingests raw `energy_per_km` values (like 0.49 or 0) without validating against real EV consumption norms ($15\text{–}25\text{ Wh/km}$).
* **Finding 3 (`backend/main.py`, Lines 148–156):** Passes raw `range_km` to ML predictor without EV prototype energy bounds.

---

## 2. Step-by-Step Execution Plan

### Step 1: Enforce EV Consumption Rate Floor ($20\text{ Wh/km}$) in Range Calculation
* **Target File:** `backend/server.py`
* **Target Function:** `_execute_pipeline_cycle()` (Lines 242–255)
* **Audit Finding Resolved:** Finding 1 (Resolves 45km / 43.11km range display)
* **Modification:**
  * Enforce realistic EV consumption rate limits ($15.0\text{ Wh/km} \le \text{epk} \le 50.0\text{ Wh/km}$, default $20.0\text{ Wh/km}$).
  * Calculate `calc_range = round(rem_wh / epk, 2)` (yielding **1.22 km** for 24.41 Wh remaining).
  * Compute `adjusted_range_km = round(calc_range * (1.0 - degradation_percent / 100.0), 2)` (yielding **1.05 km** for 13.6% degradation).
* **Rollback Note:** Revert range calculation logic in `backend/server.py`.

---

### Step 2: Validate `energy_per_km` in Telemetry Ingestion
* **Target File:** `backend/mqtt_ingest.py`
* **Target Scope:** Lines 99–104 (`_on_message` telemetry parser)
* **Audit Finding Resolved:** Finding 2
* **Modification:**
  * Validate `energy_per_km`: If payload `energy_per_km < 15.0` or `> 100.0`, default to `20.0 Wh/km` before upserting/inserting into Supabase `live_data` and `history_data`.
* **Rollback Note:** Revert `epk_val` assignment in `backend/mqtt_ingest.py`.

---

### Step 3: Align Main Entrypoint Baseline Range
* **Target File:** `backend/main.py`
* **Target Scope:** Lines 140–156 (`_run_cycle`)
* **Audit Finding Resolved:** Finding 3
* **Modification:**
  * Ensure `latest_range` passed to `predict_degradation` uses calibrated EV prototype range bounds.
* **Rollback Note:** Revert `latest_range` assignment in `backend/main.py`.

---

## 3. Verification Plan

### Automated Verification Command
```bash
python3 -c "import sys; sys.path.append('backend'); import server; payload = server._execute_pipeline_cycle(); print('BASELINE_RANGE_KM:', payload.get('range_km'), 'ADJUSTED_RANGE_KM:', payload.get('adjusted_range_km'))"
```
* **Expected Result:**
  * `BASELINE_RANGE_KM`: **1.22** (or realistic $\approx 1.2\text{ km}$ for 24.41 Wh remaining), NOT `49.8` or `45`.
  * `ADJUSTED_RANGE_KM`: **1.05** (or realistic $\approx 1.0\text{ km}$ for 13.6% degradation), NOT `43.1` or `45`.

### API Endpoint Verification
```bash
curl http://localhost:8000/latest
```
* **Expected Result:** `range_km` is `1.22` and `adjusted_range_km` is `1.05`.

---

Status: PENDING APPROVAL
