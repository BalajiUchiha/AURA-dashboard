# Bug Fix Implementation Plan: Live Telemetry Data Source Fix (live_data vs history_data)

**Audit Reference:** `audits/voltage-mismatch-db-vs-ui-20260909-1003/AUDIT.md`  
**Bug ID:** `voltage-mismatch-db-vs-ui`  
**Created:** 2026-09-09  

---

## 1. Problem Summary & Audit Findings

Empirical database queries confirmed that:
* Active live telemetry logged at **3.45V–3.6V** is stored in the `live_data` table (`id=1`).
* Stale test pipeline dataset rows with **voltage 7.6V** are stored in the `history_data` table (IDs 2977–2981).
* `fetch_recent_history()` in `backend/supabase_client.py` strictly queries `history_data`, causing `server.py` to process stale 7.6V test records instead of the active 3.45V–3.6V live telemetry.

---

## 2. Step-by-Step Execution Plan

### Step 1: Add Live Telemetry Fetch & Fallback Sync in `supabase_client.py`
* **Target File:** `backend/supabase_client.py`
* **Target Function:** `fetch_recent_history` (Line 54) & new helper `fetch_live_telemetry`
* **Audit Finding Resolved:** DB fetch source selection bug in `supabase_client.py`
* **Modification:**
  1. Add `fetch_live_telemetry()` helper that queries `live_data WHERE id=1`.
  2. In `fetch_recent_history(n)`: Compare the timestamp/ID of `live_data` against the newest row in `history_data`. If `live_data` has a newer timestamp or `history_data` lacks live telemetry, append/replace the newest element of the history array with the `live_data` record.
* **Rollback Note:** Revert `fetch_recent_history()` in `backend/supabase_client.py` to read exclusively from `history_data`.

---

### Step 2: Ensure Pipeline Cycle Uses Live Record in `server.py`
* **Target File:** `backend/server.py`
* **Target Function:** `_execute_pipeline_cycle()` (Lines 128–144)
* **Audit Finding Resolved:** Pipeline execution using stale history row for latest cache
* **Modification:**
  * Update `_execute_pipeline_cycle()` to fetch `live_data` for `latest` vehicle snapshot, while keeping history window for EKF rate-of-change calculation.
* **Rollback Note:** Revert `latest = readings[-1]` in `backend/server.py`.

---

## 3. Verification Plan

### Automated Verification Command
Run single-shot pipeline execution test:
```bash
python3 -c "import sys; sys.path.append('backend'); import server; print('LATEST CACHE VOLTAGE:', server._execute_pipeline_cycle().get('voltage'))"
```
* **Expected Result:** Output shows `LATEST CACHE VOLTAGE: 3.45` (or current `live_data` voltage), NOT `7.6`.

### API Endpoint Verification
```bash
curl http://localhost:8000/latest
```
* **Expected Result:** JSON response contains `"voltage": 3.45` (matching logged `live_data` table entry).

---

Status: PENDING APPROVAL
