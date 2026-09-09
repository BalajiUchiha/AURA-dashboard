# Bug Fix Implementation Plan: Voice Assistant Speech Fallback & ElevenLabs Auth Error Handling

**Audit Reference:** `audits/voice-assistant-silent-elevenlabs-400-browser-speech-blocked-20260909-1540/AUDIT.md`  
**Target Scope:** Voice Assistant speech hook (`useJarvisSpeech.ts`) and backend TTS proxy (`server.py`, `.env`).

---

## Proposed Remediation Steps

### Step 1: User-Gesture Speech Unlock & Fallback Resume in Voice Hook
* **File:** [frontend/src/hooks/useJarvisSpeech.ts](file:///home/ben10_balaji/V2/frontend/src/hooks/useJarvisSpeech.ts#L150-L175)
* **Function:** `useJarvisSpeech(message: string)`
* **Modification:**
  - Add a global user gesture listener (`click`, `keydown`, `touchstart`) on `window` to unlock browser audio context and call `window.speechSynthesis.resume()`.
  - In `catch` fallback block:
    - Before calling `window.speechSynthesis.speak(utt)`, execute `window.speechSynthesis.cancel()` and `window.speechSynthesis.resume()`.
    - If browser autoplay blocks initial speech call on load, register an interaction listener to trigger `speak()` as soon as the user clicks anywhere on the dashboard.
* **Database / Schema Migration:** None
* **Rollback Note:** Revert gesture listener and `speechSynthesis.resume()` additions.

---

### Step 2: ElevenLabs Error Diagnostics & Fallback Flagging in Backend
* **File:** [backend/server.py](file:///home/ben10_balaji/V2/backend/server.py#L660-L690)
* **Function:** `text_to_speech(req: TTSRequest)` (lines 660–690)
* **Modification:**
  - Log a clear diagnostic warning when ElevenLabs returns HTTP 400/401/403 invalid API key error (`"ElevenLabs API Key invalid or expired"`).
  - Return `{"audio_base64": null, "alignment": null, "error": err_detail}` so frontend cleanly enters Web Speech fallback without crashing.
* **Database / Schema Migration:** None
* **Rollback Note:** Revert logging and response handling in `/tts` route.

---

## Verification Plan

### Automated Verification
1. **Frontend Type & Build Verification:**
   - Verify frontend compiles without TypeScript or lint errors:
     ```bash
     npm --prefix frontend run build
     ```
2. **Backend Server Import & Route Test:**
   - Execute python command testing `/tts` route error handling:
     ```bash
     python3 -c "
     import sys
     sys.path.insert(0, 'backend')
     from server import app
     "
     ```

### Manual & Runtime Verification
1. **Browser Speech Fallback Test:**
   - Open dashboard in browser with invalid ElevenLabs API key.
   - Click anywhere on the dashboard. Verify browser Web Speech API speaks the JARVIS message clearly without silence or freezing.
2. **Audio Unmute Gesture Test:**
   - Trigger a new JARVIS message. Confirm speech synthesis plays as soon as user interaction occurs.

---

Status: APPROVED
