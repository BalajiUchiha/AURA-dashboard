# Bug Fix Implementation Plan: Battery Voltage, Capacity Remaining, & Runtime Calibration (10.6V Pack Baseline & Dynamic Voltage Support up to 11V)

**Audit Reference:** `audits/battery-voltage-capacity-runtime-mismatch-20260909-1115/AUDIT.md`  
**Bug ID:** `battery-voltage-capacity-runtime-mismatch`  

---

## Proposed Technical Changes

### Step 1: Update Default Pack Voltage Parameters in Backend Config
* **File:** [backend/config.py](file:///home/ben10_balaji/V2/backend/config.py#L50-L54)
* **Audit Finding Resolved:** Finding 1 (`backend/config.py`, Lines 50–54)
* **Description:** Update default battery pack voltage parameters to reflect the 10.6V battery capacity baseline (supporting up to 11.0V max):
  - `PACK_V_FULL`: Default `10.6` V (with dynamic scaling supporting up to 11.0V).
  - `PACK_V_EMPTY`: Default `8.4` V.
  - `LOW_VOLTAGE_CUTOFF`: Default `9.0` V (or `9.3` V).
* **Rollback Note:** Revert `PACK_V_FULL`, `PACK_V_EMPTY`, and `LOW_VOLTAGE_CUTOFF` defaults in `backend/config.py`.

---

### Step 2: Update Capacity Remaining (%) & Runtime Formulas in Server Pipeline & Main Entrypoint
* **Files:** [backend/server.py](file:///home/ben10_balaji/V2/backend/server.py#L226-L237) & [backend/main.py](file:///home/ben10_balaji/V2/backend/main.py#L171-L175)
* **Audit Finding Resolved:** Finding 2 (`backend/server.py`, Lines 226–237; `backend/main.py`, Lines 171–175)
* **Description:** Ensure battery percentage and capacity calculations evaluate against the 10.6V pack baseline (`PACK_V_FULL` = 10.6V, `PACK_V_EMPTY` = 8.4V). Clamp percentages accurately to `[0.0, 100.0]`, supporting input voltages up to 11.0V seamlessly without premature saturation across the 10.6V operating range.
* **Rollback Note:** Revert `bat_pct` and `cap_pct` formulas in `backend/server.py` and `backend/main.py`.

---

### Step 3: Align Low Battery Cutoff in Rule-Based Alert Engine
* **File:** [backend/alert_engine.py](file:///home/ben10_balaji/V2/backend/alert_engine.py#L27)
* **Audit Finding Resolved:** Finding 3 (`backend/alert_engine.py`, Line 27)
* **Description:** Ensure `LOW_VOLTAGE_CUTOFF` reads from `cfg.LOW_VOLTAGE_CUTOFF` (defaulting to 9.0V for 10.6V pack) so low battery alerts fire appropriately when filtered voltage drops below pack cutoff.
* **Rollback Note:** Revert `LOW_VOLTAGE_CUTOFF` in `backend/alert_engine.py`.

---

### Step 4: Add 10.6V Pack Capacity Specification & 11V Max Support to JARVIS Co-Pilot Prompts
* **File:** [backend/jarvis_client.py](file:///home/ben10_balaji/V2/backend/jarvis_client.py#L40-L92)
* **Audit Finding Resolved:** Finding 4 (`backend/jarvis_client.py`, Lines 40–92)
* **Description:** Explicitly state the battery pack voltage capacity baseline (10.6V nominal capacity, supporting up to 11.0V max threshold) in `SYSTEM_PROMPT` and `_build_user_prompt` so LLM reasoning and driver guidance correctly align with pack telemetry.
* **Rollback Note:** Revert `SYSTEM_PROMPT` and `_build_user_prompt` in `backend/jarvis_client.py`.

---

### Step 5: Update Pack Constants in Feature Extraction Module
* **File:** [backend/features.py](file:///home/ben10_balaji/V2/backend/features.py#L24-L26)
* **Audit Finding Resolved:** Finding 5 (`backend/features.py`, Lines 24–26)
* **Description:** Ensure `PACK_V_FULL` and `PACK_V_EMPTY` are loaded from `cfg` defaults (10.6V / 8.4V) so feature engineering (`voltage_drop_pct`, `dod_rate_pct_per_s`) calculates relative to the 10.6V/11V pack scale.
* **Rollback Note:** Revert `PACK_V_FULL` and `PACK_V_EMPTY` in `backend/features.py`.

---

### Step 6: Update Local Fallback Voltage Normalization in Frontend Feed Hook
* **File:** [frontend/src/hooks/useAuraFeed.ts](file:///home/ben10_balaji/V2/frontend/src/hooks/useAuraFeed.ts#L20)
* **Audit Finding Resolved:** Finding 6 (`frontend/src/hooks/useAuraFeed.ts`, Line 20)
* **Description:** Update fallback voltage percentage math from `volt / 8.4` to `volt / 10.6` (supporting up to 11.0V) to prevent offline mock data distortion.
* **Rollback Note:** Revert line 20 in `frontend/src/hooks/useAuraFeed.ts`.

---

## Verification Plan

### Automated Verification Commands

1. **Verify Config & Pipeline Metrics (Python Test):**
   ```bash
   python3 -c "
   import sys; sys.path.append('backend');
   import config as cfg; import server;
   print('PACK_V_FULL:', cfg.PACK_V_FULL)
   print('PACK_V_EMPTY:', cfg.PACK_V_EMPTY)
   print('LOW_VOLTAGE_CUTOFF:', cfg.LOW_VOLTAGE_CUTOFF)
   payload = server._execute_pipeline_cycle()
   print('CAPACITY_PCT:', payload.get('capacity_remaining_percent'))
   print('EST_RUNTIME_S:', payload.get('estimated_runtime_seconds'))
   "
   ```
   - **Expected Result:** `PACK_V_FULL` = 10.6 (or configurable), `PACK_V_EMPTY` = 8.4, `LOW_VOLTAGE_CUTOFF` = 9.0. `CAPACITY_PCT` and `EST_RUNTIME_S` produce calibrated, non-saturated numbers for 10.6V–11V pack telemetry.

2. **Verify Alert Engine & JARVIS Prompt (Python Test):**
   ```bash
   python3 -c "
   import sys; sys.path.append('backend');
   from alert_engine import analyze_alerts;
   res = analyze_alerts(8.8, -0.01, 1.2, 0.01, 14.0, 0.0)
   print('ALERT_FLAG:', res['alert_flag'])
   print('ALERT_MSG:', res['alert_message'])
   "
   ```
   - **Expected Result:** `ALERT_FLAG` = `low_battery` when filtered voltage is 8.8V (< 9.0V cutoff).

3. **Frontend Build Check:**
   ```bash
   cd frontend && npm run build
   ```
   - **Expected Result:** Zero build or TypeScript errors.

---

Status: APPROVED
