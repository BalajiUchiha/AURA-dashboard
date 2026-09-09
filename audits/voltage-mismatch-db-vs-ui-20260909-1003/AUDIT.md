# Bug Audit Report: Voltage Mismatch Trace (DB fetch history_data 7.6V vs live_data 3.45V/3.6V)

**Audit ID:** `voltage-mismatch-db-vs-ui-20260909-1003`  
**Date:** 2026-09-09  
**Status:** Complete (Empirical Codebase Audit)

---

## 1. Bug Description & Parsing

* **Observed Symptom:** The UI / API display shows `7.6V`, whereas the logged voltage in the database (live telemetry record) is `3.45V`–`3.6V`.
* **Expected Behavior:** The backend analysis loop and `/latest` API endpoint should fetch the active telemetry reading (`3.45V`–`3.6V`) and serve it to the UI.
* **Actual Behavior:** Backend serves `7.6V`.
* **User Question:** Trace back where the bug is: **DB fetch**, **filtering**, or **prediction**.

---

## 2. Empirical Root Cause Analysis & Database Findings

Direct database inspection of the Supabase tables (`live_data` vs `history_data`) revealed the exact root cause:

### Database Table Audit
* **`live_data` Table (ID 1):**
  ```json
  [{"id": 1, "voltage": 3.45, "current_a": 0.022, "updated_at": "2026-09-08T16:15:30"}]
  ```
  *(This table contains the active logged telemetry at 3.45V–3.6V).*

* **`history_data` Table (Latest Rows ID 2977–2981):**
  ```json
  [{"id": 2981, "voltage": 7.6, "created_at": "2026-09-08T16:11:02"}]
  ```
  *(This table contains old test pipeline dataset rows stuck at 7.6V).*

### Code Path Breakdown

1. **DB Fetch (`backend/supabase_client.py` Line 54):**
   ```python
   def fetch_recent_history(n: int = cfg.HISTORY_WINDOW) -> list[dict]:
       response = _client.table("history_data").select("*").order("id", desc=True).limit(n).execute()
   ```
   * **Root Cause Found Here:** `fetch_recent_history()` ONLY queries the `history_data` table.
   * When live telemetry is updated in `live_data` (or when `history_data` has not received new inserts), `fetch_recent_history()` returns the old static rows from `history_data` (ID 2981, voltage = 7.6V).

2. **Pipeline Execution (`backend/server.py` Lines 128–144):**
   ```python
   readings = fetch_recent_history(cfg.HISTORY_WINDOW)
   latest = readings[-1]
   ```
   * `server.py` calls `fetch_recent_history()`, receiving the 7.6V row from `history_data`.
   * `latest` becomes `{'voltage': 7.6, ...}`.

3. **Filtering (`backend/ekf_filter.py`) & Prediction (`backend/ml_predictor.py`)**:
   * EKF receives `[7.6, 7.6, ...]` from `history_data` and outputs filtered voltage `7.6V`.
   * ML predictor reads features from EKF results.
   * **Neither EKF filtering nor ML prediction modifies the raw voltage.** They process whatever `fetch_recent_history()` returns.

---

## 3. Verdict

**The bug is located at DB FETCH / DATA SOURCE SELECTION in `backend/supabase_client.py` & `backend/server.py`.**

* Live telemetry logged at 3.45V–3.6V resides in `live_data`.
* `fetch_recent_history()` reads from `history_data`, which contains stale 7.6V test records.
* Filtering and prediction accurately process the 7.6V input they were given by `fetch_recent_history()`.

---

## 4. Scope & Affected Files Summary

| Component | File Path | Function / Line | Finding |
|---|---|---|---|
| Supabase Client | [supabase_client.py](file:///home/ben10_balaji/V2/backend/supabase_client.py#L54-L79) | `fetch_recent_history` (Line 54) | Queries `history_data` instead of merging with latest `live_data` record |
| Backend Server | [server.py](file:///home/ben10_balaji/V2/backend/server.py#L128-L144) | `_execute_pipeline_cycle` (Line 128) | Relies on `fetch_recent_history()` for current telemetry snapshot |
| EKF Filter | [ekf_filter.py](file:///home/ben10_balaji/V2/backend/ekf_filter.py#L38) | `ScalarEKF` | Clean (filters whatever inputs it receives) |
| ML Predictor | [ml_predictor.py](file:///home/ben10_balaji/V2/backend/ml_predictor.py#L124) | `predict_degradation` | Clean (predicts based on input window) |

---

## 5. Audit Confidence Level

**Confidence:** **HIGH (Verified with live Supabase table queries)**
