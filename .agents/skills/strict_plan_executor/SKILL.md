---
name: strict_plan_executor
description: |
  **What it does:** Executes an approved `PLAN.md` produced by the bug-fix planning skill. Performs the exact code edits, enforces strict runtime guarantees, and records verification results.
  **When to use:**
  - The user says to execute, implement, or carry out an approved `PLAN.md`.
  - An approved plan file exists (status not `PENDING APPROVAL`) under an audit folder.
  - The request mentions "apply the plan", "run the remediation", "execute the fix", or similar wording.
---
## Body – Step-By-Step Procedure
1. **Locate the plan**
   - If the user supplies a path, use it; otherwise, find the most recent `PLAN.md` under `audits/` whose status is not `PENDING APPROVAL`.
   - Abort with a clear message if no approved plan is found.
2. **Parse `PLAN.md`**
   - Extract the ordered list of steps: file changes (path, function, line range, description), any migration/schema steps, and associated rollback notes.
   - Capture the **Verification** section (endpoints to test, expected success/failure responses, DB state, per-field validation gates). This section always exists — `bug_fix_plan` never produces a plan without it.
3. **Apply code edits**
   - For each file-change step, open the target source file and perform the edit **exactly** as described.
   - Use a single contiguous edit per file when possible; if a step requires multiple non-adjacent edits, combine them via the multi-replace tool.
   - Preserve existing formatting, comments, and unrelated code. Touch nothing not named in the plan.
4. **Apply migrations / schema changes**
   - If a step includes a migration, create the migration file under the project's migration directory (e.g., `backend/migrations/`) with the supplied SQL snippet.
   - Do not modify any other schema files.
5. **Enforce strict runtime guarantees**
   - **Frontend ↔ backend success signalling**: every UI component that shows a success toast/popup must do so only after receiving a backend response with an explicit success flag (`{"success":true}`) — never on request-sent, never on optimistic UI.
   - **Failure handling**: any non-2xx response or `{"success":false}` must trigger a visible failure popup; verify error paths are not silently swallowed, for GET/POST/PATCH/PUT/DELETE alike.
   - **Backend write checks**: for every parameterized INSERT/UPDATE/DELETE in the changed code, confirm the affected-row-count or returned row is validated before a success response is sent. If code in scope lacks this and the plan didn't cover it, abort and report — do not add the fix outside the plan.
   - **No fallback seeding**: for every mandatory field touched by the fix, confirm there is an active validation gate that blocks the request entirely when that field is empty and prompts the user to fill it — not merely that no new default value literal appears in the diff.
   - **User-action gating**: confirm that state-changing writes (cart-add, checkout, payment) fire only after a confirmed, completed user action, and only after the backend has replied with success. If any code path lets navigation, a back-button press, or merely viewing a step trigger the write, abort and flag it.
6. **Run the plan's Verification section — mandatory, not conditional**
   - Actually exercise every request listed (e.g. via `curl` or the project's test runner) and compare the response against the plan's expected success/failure body.
   - Check the resulting DB state against what the plan specified — don't infer it from the code, query it.
   - Attempt each documented missing-field case and confirm the request is blocked client-side rather than sent with a default.
7. **Create `VERIFICATION.md`**
   - In the same audit folder, write a file summarising each check from steps 5–6: one line per check — `PASS` or `FAIL`, file path/line or actual request/response evidence.
   - Set overall status to `SUCCESS` only if every check passed; otherwise `FAILED`, with the specific failing checks called out.
8. **Report outcome**
   - State the path of `VERIFICATION.md` and the overall status clearly in your final response.
   - If status is `FAILED`, stop there — do not attempt to silently patch around the failure. Report it and wait for human review.
9. **Never scope-creep** — do not edit files or add logic not explicitly listed in the plan. If a required edit is missing from the plan, abort and ask the user to update the plan first.
