# Bug Fix Implementation Plan: Capacity % & Runtime Synchronization, TTS Deduplication, & 2.5s Live Data Throttling

**Audit Reference:** `audits/capacity-runtime-tts-livedata-calibration-20260909-1521/AUDIT.md`  
**Target Scope:** Backend capacity/runtime pipeline (`server.py`, `main.py`), Voice Assistant hook (`useJarvisSpeech.ts`), and MQTT Ingestion pipeline (`mqtt_ingest.py`, `config.py`).

---

## Proposed Remediation Steps

### Step 1: Export 2.5s Throttle Interval in Backend Configuration
* **File:** [backend/config.py](file:///home/ben10_balaji/V2/backend/config.py#L38)
* **Function / Global Scope:** Configuration constants (lines 35–45)
* **Modification:**
  - Define and export `LIVE_INSERT_INTERVAL_S = 2.5` alongside `HISTORY_INSERT_INTERVAL_S = 5.0`.
* **Database / Schema Migration:** None
* **Rollback Note:** Revert line addition in `config.py`.

---

### Step 2: Throttle `live_data` Table Updates to 2.5s Cadence in MQTT Ingestion
* **File:** [backend/mqtt_ingest.py](file:///home/ben10_balaji/V2/backend/mqtt_ingest.py#L34-L130)
* **Function / Global Scope:** `IngestionState` class & `on_message()` callback (lines 34–40, 124–130)
* **Modification:**
  - Add `self.last_live_insert = 0.0` to `IngestionState.__init__()`.
  - In `on_message()`, check `if time.time() - state.last_live_insert >= LIVE_INSERT_INTERVAL_S:` before executing `supabase_client.update_live_data(telemetry)`.
  - Update `state.last_live_insert = time.time()` upon executing the live update.
* **Database / Schema Migration:** None
* **Rollback Note:** Remove `last_live_insert` timer check and execute `update_live_data()` unconditionally.

---

### Step 3: Calibrate Usable Energy & Runtime against Capacity % in Backend Pipelines
* **Files:** [backend/server.py](file:///home/ben10_balaji/V2/backend/server.py#L222-L258) & [backend/main.py](file:///home/ben10_balaji/V2/backend/main.py#L168-L185)
* **Function:** Payload builder / polling pipeline loop
* **Modification:**
  - Calculate `cap_pct` based on cell voltage boundaries.
  - Calculate usable energy as `effective_rem_wh = (cap_pct / 100.0) * BATTERY_ENERGY_WH`.
  - If `cap_pct == 0.0` or `effective_rem_wh <= 0.0`, set `runtime_s = 0.0`.
  - Otherwise calculate `runtime_s = (effective_rem_wh / active_power) * 3600.0` (or baseline load fallback).
  - Ensure `capacity_remaining_percent` and `estimated_runtime_seconds` in response JSON strictly match these synchronized values.
* **Database / Schema Migration:** None
* **Rollback Note:** Revert calculation logic back to raw uncalibrated `rem_wh`.

---

### Step 4: Add Message Deduplication to Voice Assistant Hook
* **File:** [frontend/src/hooks/useJarvisSpeech.ts](file:///home/ben10_balaji/V2/frontend/src/hooks/useJarvisSpeech.ts#L24-L40)
* **Function:** `useJarvisSpeech(message: string)`
* **Modification:**
  - Add a `lastSpokenMessageRef = useRef<string>("")` tracking ref.
  - In `useEffect`, if `message === lastSpokenMessageRef.current` or `!message`, return early without resetting state or re-firing audio synthesis.
  - Update `lastSpokenMessageRef.current = message` when starting speech synthesis for a new message.
* **Database / Schema Migration:** None
* **Rollback Note:** Remove `lastSpokenMessageRef` check in `useEffect`.

---

## Verification Plan

### Automated Verification
1. **Backend Pipeline & Math Test:**
   - Execute telemetry pipeline python validation to confirm zero capacity yields 0 mins runtime:
     ```bash
     python3 -c "
     import sys
     sys.path.insert(0, 'backend')
     from server import app
     # Test endpoint or payload math directly
     "
     ```
2. **Frontend Type & Build Verification:**
   - Verify frontend compiles without TypeScript or lint errors:
     ```bash
     npm --prefix frontend run build
     ```

### Manual & Runtime Verification
1. **Capacity & Runtime Sync Check:**
   - Simulate an empty battery payload (voltage <= empty cutoff, cap_pct = 0.0%).
   - Verify `estimated_runtime_seconds` is `0.0` and capacity is `0.0%` in backend JSON output and HUD UI.
2. **TTS Re-firing Check:**
   - Observe browser console / audio when `jarvis_message` is repeatedly passed on polling frames.
   - Verify speech synthesis plays exactly once per distinct message and does not continuously restart.
3. **Live Data Update Throttle Check:**
   - Run backend ingestion while sending continuous MQTT messages (< 1s frequency).
   - Observe Supabase `live_data` table updates to confirm timestamp progression occurs every 2.5 seconds.

---

Status: APPROVED
