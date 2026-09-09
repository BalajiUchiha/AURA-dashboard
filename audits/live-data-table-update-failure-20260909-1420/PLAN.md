# Bug Fix Implementation Plan: Live Data Table Update Fix (`live_data` Upsert Conflict Resolution)

**Audit Reference:** `audits/live-data-table-update-failure-20260909-1420/AUDIT.md`  
**Bug ID:** `live-data-table-update-failure`  

---

## Proposed Technical Changes

### Step 1: Update `update_live_data()` Query Strategy in Supabase Client
* **File:** [backend/supabase_client.py](file:///home/ben10_balaji/V2/backend/supabase_client.py#L231-L248)
* **Audit Finding Resolved:** Finding 1 (`backend/supabase_client.py`, Lines 231–248)
* **Description:** Modify `update_live_data()` to execute an explicit `.update(payload).eq("id", 1)` query first. If no existing row `id=1` is returned, fall back to `.insert(payload)` or `.upsert(payload, on_conflict="id")` to guarantee row `id=1` in `live_data` updates reliably on every telemetry cycle.
* **Rollback Note:** Revert `update_live_data()` in `backend/supabase_client.py`.

---

### Step 2: Verify `update_live_data()` Return Logging in MQTT Ingest
* **File:** [backend/mqtt_ingest.py](file:///home/ben10_balaji/V2/backend/mqtt_ingest.py#L123-L148)
* **Audit Finding Resolved:** Finding 2 (`backend/mqtt_ingest.py`, Lines 123–148)
* **Description:** Ensure `live_res` returned from `update_live_data()` is checked and logged when updated, providing clear feedback in terminal logs when `live_data` updates occur.
* **Rollback Note:** Revert logging statements in `backend/mqtt_ingest.py`.

---

## Verification Plan

### Automated Verification Commands

1. **Verify Live Data Update (Python Test):**
   ```bash
   python3 -c "
   import sys; sys.path.append('backend');
   import supabase_client as db;
   from datetime import datetime, timezone;
   now = datetime.now(timezone.utc).isoformat()
   res = db.update_live_data({'voltage': 10.95, 'speed': 16.5})
   print('LIVE_DATA UPDATE RESULT:', res)
   assert res is not None, 'update_live_data failed'
   "
   ```
   - **Expected Result:** `LIVE_DATA UPDATE RESULT` returns updated row dict with `voltage: 10.95`, `speed: 16.5`, and matching current timestamp.

2. **Verify Database Table Consistency:**
   ```bash
   python3 -c "
   import sys; sys.path.append('backend');
   import supabase_client as db;
   live = db.fetch_live_telemetry()
   print('FETCHED LIVE TELEMETRY:', live)
   assert live.get('voltage') == 10.95, 'Live data voltage did not update'
   "
   ```
   - **Expected Result:** `FETCHED LIVE TELEMETRY` displays updated voltage (`10.95V`).

---

Status: APPROVED
