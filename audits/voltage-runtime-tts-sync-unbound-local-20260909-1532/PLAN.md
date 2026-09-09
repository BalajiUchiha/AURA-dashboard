# Bug Fix Implementation Plan: MQTT Ingest UnboundLocalError, 0-Min Falsy Runtime Display, & TTS Typing Sync

**Audit Reference:** `audits/voltage-runtime-tts-sync-unbound-local-20260909-1532/AUDIT.md`  
**Target Scope:** MQTT Ingest callback (`mqtt_ingest.py`), HUD Dashboard runtime renderer (`Dashboard.tsx`), and Voice Assistant speech hook (`useJarvisSpeech.ts`).

---

## Proposed Remediation Steps

### Step 1: Fix `UnboundLocalError` in MQTT Ingest Callback
* **File:** [backend/mqtt_ingest.py](file:///home/ben10_balaji/V2/backend/mqtt_ingest.py#L86)
* **Function:** `_on_message(client, userdata, msg)` (lines 84–88)
* **Modification:**
  - Add `_last_live_insert_time` to the `global` declaration inside `_on_message()`:
    ```python
    global _last_message_timestamp, _last_live_insert_time, _last_history_insert_time
    ```
* **Database / Schema Migration:** None
* **Rollback Note:** Revert global declaration line in `_on_message()`.

---

### Step 2: Fix Falsy `0` Runtime Handling in HUD Dashboard
* **File:** [frontend/src/components/aura/Dashboard.tsx](file:///home/ben10_balaji/V2/frontend/src/components/aura/Dashboard.tsx#L30-L32)
* **Function / Component:** `Dashboard()` component (lines 30–32)
* **Modification:**
  - Update `runtimeMinutes` evaluation from ternary boolean check `frame?.estimated_runtime_seconds ? ...` to explicit type check:
    ```typescript
    const runtimeMinutes = typeof frame?.estimated_runtime_seconds === "number"
      ? Math.round(frame.estimated_runtime_seconds / 60)
      : null;
    ```
  - Ensures `0` minutes estimated runtime renders as `0` instead of `null` or falling back to 240 mins.
* **Database / Schema Migration:** None
* **Rollback Note:** Revert ternary check back to boolean existence.

---

### Step 3: Eliminate TTS Network Freeze & Synchronize Voice Typing Effect
* **File:** [frontend/src/hooks/useJarvisSpeech.ts](file:///home/ben10_balaji/V2/frontend/src/hooks/useJarvisSpeech.ts#L45-L160)
* **Function / Hook:** `useJarvisSpeech(message: string)`
* **Modification:**
  - Do not reset `typed` to empty `""` while network request `postTts()` is in flight; display current `message` (or start initial smooth typewriter stream) so the panel never freezes blank.
  - When `postTts` audio begins playing, synchronize character reveal with `audio.currentTime` / `TtsAlignment`.
  - For browser `SpeechSynthesisUtterance` fallback, bind boundary events (`utt.onboundary`) to sync typed character progress with real speech utterance events.
* **Database / Schema Migration:** None
* **Rollback Note:** Revert `useJarvisSpeech.ts` hook state flow.

---

## Verification Plan

### Automated Verification
1. **MQTT Callback Import & Execution Test:**
   - Execute python command simulating incoming MQTT payload to verify no `UnboundLocalError` occurs:
     ```bash
     python3 -c "
     import sys
     sys.path.insert(0, 'backend')
     import mqtt_ingest
     # Test _on_message execution path
     "
     ```
2. **Frontend Type & Build Verification:**
   - Verify frontend compiles cleanly:
     ```bash
     npm --prefix frontend run build
     ```

### Manual & Runtime Verification
1. **MQTT Ingest Terminal Log Check:**
   - Observe `python3 server.py` process; verify log entries show successful `live_data` updates every 2.5 seconds without `UnboundLocalError`.
2. **0-Min Runtime Display Check:**
   - Input 8V empty battery payload (`voltage: 8.0`). Verify HUD StatCard displays `0 min` estimated runtime instead of blank or 240 min.
3. **TTS Typing & Speech Sync Check:**
   - Trigger a new JARVIS message. Confirm text appears immediately without a 2.5s blank freeze and types out in sync with audio speech.

---

Status: APPROVED
