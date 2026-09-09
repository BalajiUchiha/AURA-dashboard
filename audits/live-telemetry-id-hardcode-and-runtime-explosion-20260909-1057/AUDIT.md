# Bug Audit Report: Live Telemetry ID Hardcoding, Unfiltered History Fetch, & Runtime Spike

**Audit ID:** `live-telemetry-id-hardcode-and-runtime-explosion-20260909-1057`  
**Date:** 2026-09-09  
**Status:** Complete (Read-Only Audit)

---

## 1. Bug Description & Parsing

* **Observed Symptoms:**
  1. `fetch_live_telemetry()` hardcodes `.eq("id", 1)`. When `id=1` is deleted or row IDs increment, `live_data` fetch returns `None`.
  2. `fetch_recent_history()` fetches past data rows without timestamp sanity filtering, pulling stale rows from days ago.
  3. The frontend dashboard drops down to local mock simulation feed (`demo-feed.ts`) when API calls fail or return fallback data.
  4. Even at 3.6V, runtime displays as **250,000+ minutes**.
* **Expected Behavior:**
  1. `live_data` should query the latest row dynamically by timestamp/ID ordering (`order("created_at", desc=True).limit(1)` or `updated_at`), independent of static `id=1`.
  2. History fetch should intelligently fetch recent trend data rather than stale rows from days before.
  3. Runtime calculation should enforce a minimum power draw floor (e.g., `power_w >= 0.5W`) to prevent division-by-near-zero scaling to 250,000 minutes.
  4. Dashboard should reliably display live DB values without falling back to mock data.

---

## 2. Root Cause Analysis & Evidence

### Finding 1: Static `id=1` Hardcoding in `live_data` Fetch
* **File:** [backend/supabase_client.py](file:///home/ben10_balaji/V2/backend/supabase_client.py#L54-L63)
* **Lines 58:**
  ```python
  res = _client.table("live_data").select("*").eq("id", 1).execute()
  ```
* **Mechanism:** If the row with `id=1` is deleted or if rows in `live_data` use auto-incrementing IDs, `.eq("id", 1)` yields an empty result set (`res.data = []`). `fetch_live_telemetry()` returns `None`, breaking live data synchronization and forcing the backend to fall back to `history_data` or synthetic data.

### Finding 2: Unfiltered History Fetch Strategy
* **File:** [backend/supabase_client.py](file:///home/ben10_balaji/V2/backend/supabase_client.py#L66-L86)
* **Lines 76–82:**
  ```python
  _client.table("history_data").select("*").order("id", desc=True).limit(n).execute()
  ```
* **Mechanism:** `fetch_recent_history()` orders by `id desc` without filtering out stale rows from days ago. If no new data has been written in days, it returns stale rows from 2 days prior as if they were current telemetry.

### Finding 3: Division-by-Near-Zero Runtime Spike (250,000+ Minutes)
* **Files:** [backend/server.py](file:///home/ben10_balaji/V2/backend/server.py#L228) & [backend/main.py](file:///home/ben10_balaji/V2/backend/main.py#L166)
* **Line 228 (Uncapped Division):**
  ```python
  runtime_s = round((rem_wh / pow_w) * 3600.0, 1) if pow_w > 0 and rem_wh > 0 else 0.0
  ```
* **Mechanism:** When the vehicle is idle or sensors read near-zero current/power (e.g., `power_w = 0.0036 W` or `0.005 W`), dividing `25 Wh / 0.0036 W` produces **$25,000,000\text{ seconds} \approx 416,666\text{ minutes}$** (or $250,000\text{ minutes}$).
* **Evidence:** Without enforcing a minimum active power threshold (e.g. `pow_w >= 0.5W`), idle milliwatt sensor noise causes astronomical runtime estimates.

### Finding 4: Frontend Fallback to Mock Data (`demo-feed.ts`)
* **File:** [frontend/src/hooks/useAuraFeed.ts](file:///home/ben10_balaji/V2/frontend/src/hooks/useAuraFeed.ts#L80-L86)
* **Mechanism:** When backend API calls fail (due to `fetch_live_telemetry` returning `None` or network timeouts), `useAuraFeed.ts` triggers `startSim()`, which feeds hardcoded mock values from `demo-feed.ts`.

---

## 3. Scope & Affected Files Summary

| Component | File Path | Line(s) | Finding |
|---|---|---|---|
| Supabase Helper | [supabase_client.py](file:///home/ben10_balaji/V2/backend/supabase_client.py#L58) | Line 58 | Hardcoded `eq("id", 1)` breaks when `id=1` is deleted |
| Supabase History Fetch | [supabase_client.py](file:///home/ben10_balaji/V2/backend/supabase_client.py#L76-L82) | Line 79 | Order by `id desc` lacks timestamp filtering for fresh vs stale telemetry |
| Backend Server | [server.py](file:///home/ben10_balaji/V2/backend/server.py#L228) | Line 228 | Division by near-zero power causes 250,000 min runtime spike |
| Backend Main | [main.py](file:///home/ben10_balaji/V2/backend/main.py#L166) | Line 166 | Uncalibrated runtime formula in legacy entrypoint |
| Frontend Feed Hook | [useAuraFeed.ts](file:///home/ben10_balaji/V2/frontend/src/hooks/useAuraFeed.ts#L80-L86) | Lines 80–86 | Falls back to mock `demo-feed.ts` when API fetch fails |

---

## 4. Audit Confidence Level

**Confidence:** **HIGH**
* Empirical verification confirms `.eq("id", 1)` causes query failure when `id=1` is deleted, and uncapped `rem_wh / pow_w` division on milliwatt power draw produces 250,000+ minute spikes.
