# Bug Fix Implementation Plan: Dynamic Live Telemetry Fetch & Runtime Calibration

**Audit Reference:** `audits/live-telemetry-id-hardcode-and-runtime-explosion-20260909-1057/AUDIT.md`  
**Bug ID:** `live-telemetry-id-hardcode-and-runtime-explosion`  
**Created:** 2026-09-09  

---

## 1. Problem Summary & Audit Findings

The audit identified four critical flaws:
* **Finding 1 (`backend/supabase_client.py`, Line 58):** `fetch_live_telemetry()` hardcodes `.eq("id", 1)`. When row `id=1` is deleted or IDs increment, query yields empty results.
* **Finding 2 (`backend/supabase_client.py`, Line 76–82):** `fetch_recent_history()` queries `history_data` ordered by `id desc` without selecting the latest available row dynamically across `live_data` and `history_data`.
* **Finding 3 (`backend/server.py`, Line 228 & `backend/main.py`, Line 166):** Runtime calculation divides `rem_wh` by `pow_w` without enforcing a minimum active power threshold (e.g. `pow_w >= 0.5W`), causing 250,000+ min spikes on near-zero power readings.
* **Finding 4 (`frontend/src/hooks/useAuraFeed.ts`, Lines 80–86):** UI falls back to `demo-feed.ts` simulation data when API fetch fails.

---

## 2. Step-by-Step Execution Plan

### Step 1: Remove Static `id=1` Hardcoding in `supabase_client.py`
* **Target File:** `backend/supabase_client.py`
* **Target Function:** `fetch_live_telemetry()` (Lines 54–63)
* **Audit Finding Resolved:** Finding 1 (Resolves static `id=1` failure)
* **Modification:**
  * Update `fetch_live_telemetry()` to query `live_data` ordered by `created_at desc` or `updated_at desc` or `id desc` with `limit(1)` instead of `.eq("id", 1)`.
* **Rollback Note:** Revert `fetch_live_telemetry()` in `backend/supabase_client.py` to `.eq("id", 1)`.

---

### Step 2: Update `fetch_recent_history()` to Intelligently Fetch Latest Telemetry
* **Target File:** `backend/supabase_client.py`
* **Target Function:** `fetch_recent_history()` (Lines 66–100)
* **Audit Finding Resolved:** Finding 2
* **Modification:**
  * Dynamically fetch newest row from `live_data` (ordered by `created_at desc` or `updated_at desc` or `id desc`) and merge with `history_data` window. If `history_data` is empty or missing, construct trend window from `live_data`.
* **Rollback Note:** Revert `fetch_recent_history()` in `backend/supabase_client.py`.

---

### Step 3: Fix Division-by-Near-Zero Runtime Calculation in Backend Entrypoints
* **Target Files:**
  1. `backend/server.py` (Lines 228–245)
  2. `backend/main.py` (Lines 163–170)
* **Audit Finding Resolved:** Finding 3 (Resolves 250,000+ min runtime spike)
* **Modification:**
  * Enforce power threshold (`pow_w >= 0.5W`). When `pow_w < 0.5W` (idle/stationary), calculate runtime using nominal idle power load (e.g. 15W) and cap runtime at a realistic maximum (e.g. 240 minutes / 4 hours) to eliminate 250,000+ minute spikes.
* **Rollback Note:** Revert runtime formulas in `server.py` and `main.py`.

---

## 3. Verification Plan

### Automated Verification Command
```bash
python3 -c "import sys; sys.path.append('backend'); import server; payload = server._execute_pipeline_cycle(); print('VOLTAGE:', payload.get('voltage'), 'RUNTIME_MIN:', round(payload.get('estimated_runtime_seconds', 0)/60, 1))"
```
* **Expected Result:**
  * `VOLTAGE`: Returns actual live telemetry voltage from `live_data` (e.g., `3.6`).
  * `RUNTIME_MIN`: Sane, realistic runtime (e.g., `< 180` minutes), NOT `250,000`.

### API Endpoint Verification
```bash
curl http://localhost:8000/latest
```
* **Expected Result:** `voltage` matches active DB row and `estimated_runtime_seconds` is bounded.

---

Status: PENDING APPROVAL
