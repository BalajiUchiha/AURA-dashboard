---
name: bug_trace_audit
description: |
  **What it does:** Audits a reported bug by tracing the code path from the frontend symptom to backend persistence, collecting concrete evidence without modifying any code.
  **When to use:**
  - The user describes a bug/issue and asks to trace, investigate, find the root cause, or audit it.
  - Vague descriptions such as "cart total is wrong sometimes" or "user says their order didn't save" also trigger this skill.
  - The request is read-only; no code changes should be performed.
---
## Body – Step-By-Step Procedure
1. **Parse the bug description**
   - Extract *observed symptom*, *expected behavior*, *actual behavior*, and any *reproduction steps / inputs* supplied by the user.
   - Store these pieces for later reference.
2. **Identify a bug slug**
   - Create a short, hyphenated identifier from the symptom (e.g., `cart-total-wrong`).
   - Append a timestamp `YYYYMMDD-hhmm` to form the audit folder name.
3. **Search the codebase outward from the symptom**
   - Locate relevant error strings, endpoint names, component names, table/column names.
   - Follow the full chain **frontend component → hook/state → API client call → backend route → controller/service → query/ORM call → table/schema** and then trace the response back to the frontend consumer.
   - Open each candidate file and verify the connection (imports, function calls, route registration, etc.) before adding it to the chain — never add a file on assumption alone.
4. **Collect concrete evidence**
   - List **every file actually touched** in the chain with the exact function name(s) and line numbers that relate to the bug.
   - While tracing, check for the recurring failure patterns on this project:
     - Parameterized queries whose affected-row-count or error isn't checked before returning success.
     - `try/catch` blocks that swallow errors and let the request continue as if nothing happened.
     - Places where a default/fallback value is substituted for missing data instead of surfacing the gap.
     - Mutations that can fire from a UI action (e.g., back button, page view) without an explicit user-completed action.
   - Record any occurrences with file path and line numbers.
5. **Assemble the audit report**
   - Create directory `audits/<bug-slug>-<YYYYMMDD-hhmm>/`.
   - Write `AUDIT.md` containing:
     - The bug as understood (symptom, expected vs. actual, reproduction steps).
     - A *root-cause hypothesis* with concrete evidence (file + line references). If evidence is insufficient, explicitly state that the root cause cannot be pinned down — never fill the gap with a guess.
     - The full request/response trace discovered.
     - A list of every file in scope with relevant functions/lines.
     - A confidence level (High / Medium / Low) based on the amount of evidence.
6. **Never modify source code** — this skill only creates the audit folder and `AUDIT.md`.
7. **Hand-off** — state the full path of the created audit folder clearly in your final response (e.g. "Audit written to `audits/cart-total-wrong-20260901-1420/AUDIT.md`") so it can be found by the planning skill in a later turn.
