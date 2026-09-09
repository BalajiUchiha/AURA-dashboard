# Bug Audit Report: Live Data Table Update Failure Trace (`history_data` updates vs `live_data` frozen)

**Audit ID:** `live-data-table-update-failure-20260909-1420`  
**Date:** 2026-09-09  
**Status:** Complete (Read-Only Codebase Audit)

---

## 1. Bug Description & Parsing

* **Observed Symptom:**
  1. Incoming vehicle telemetry is successfully inserted and updated in the `history_data` table in Supabase.
  2. However, nothing updates in the `live_data` table in Supabase (`live_data` remains frozen at old/stale readings).
* **Expected Behavior:**
  1. Every incoming telemetry message processed by `mqtt_ingest.py` (or backend server cycle) should update the active telemetry snapshot in `live_data` (row `id=1` or latest timestamp) in real-time alongside `history_data`.
  2. The frontend dashboard and API endpoints reading live telemetry should reflect real-time updates from `live_data`.
* **Actual Behavior:**
  1. `history_data` inserts succeed because `insert_history_data()` uses `.insert(payload).execute()`.
  2. `live_data` updates fail silently because `update_live_data()` calls `.upsert(payload).execute()` on `id=1` without specifying `on_conflict="id"` or attempting an explicit `.update(payload).eq("id", 1)`. Supabase PostgREST ignores column updates on primary key conflict when `on_conflict` is omitted, leaving `live_data` frozen.

---

## 2. Root Cause Analysis & Empirical Evidence

### Finding 1: PostgREST `upsert` Conflict Strategy Omission in `update_live_data()`
* **File:** [backend/supabase_client.py](file:///home/ben10_balaji/V2/backend/supabase_client.py#L231-L248)
* **Lines 236–242:**
  ```python
  def update_live_data(telemetry: dict) -> dict | None:
      if _client is not None:
          try:
              payload = {k: v for k, v in telemetry.items() if v is not None and k != "created_at"}
              payload["id"] = 1
              payload["updated_at"] = datetime.now(timezone.utc).isoformat()
              res = _client.table("live_data").upsert(payload).execute()
              return res.data[0] if res.data else {"id": 1}
  ```
* **Empirical Test & Verification:**
  - Running `.upsert(payload)` on `live_data` returned an unchanged `updated_at` timestamp ('2026-09-09T08:48:04'), leaving all telemetry fields in row `id=1` untouched.
  - Running `.update(payload).eq("id", 1)` immediately updated the `live_data` row with new voltage, current, and timestamp data ('2026-09-09T08:50:26').
  - **Root Cause:** PostgREST Python SDK `.upsert()` requires explicit conflict resolution (`on_conflict="id"`). Without it, PostgREST falls back to ignored conflicts or insert attempts that fail on existing primary key `id=1`.

### Finding 2: Ingest Flow Asymmetry between `history_data` and `live_data`
* **File:** [backend/mqtt_ingest.py](file:///home/ben10_balaji/V2/backend/mqtt_ingest.py#L123-L134)
* **Lines 124 & 131:**
  ```python
  # Always update live_data (fast upsert, keeps dashboard responsive)
  live_res = supabase_client.update_live_data(telemetry)

  # Throttle history_data inserts to avoid DB flooding
  if elapsed >= HISTORY_INSERT_INTERVAL_S:
      hist_res = supabase_client.insert_history_data(telemetry)
  ```
* **Mechanism:**
  - `insert_history_data()` invokes `.insert(payload).execute()`, which appends new auto-incrementing rows (`id=2980`, `id=2981`, etc.) into `history_data` without key conflicts.
  - `update_live_data()` invokes `.upsert(payload).execute()` targeting existing row `id=1`. Due to Finding 1, PostgREST skips updating row `id=1`.
  - Result: `history_data` updates continuously, while `live_data` remains completely frozen.

### Finding 3: `fetch_live_telemetry()` Fallback Chain Impact
* **File:** [backend/supabase_client.py](file:///home/ben10_balaji/V2/backend/supabase_client.py#L54-L80)
* **Mechanism:** When `live_data` is frozen, `fetch_live_telemetry()` reads row `id=1` from `live_data` which contains stale timestamps and outdated telemetry values.

---

## 3. End-to-End Execution Trace

```mermaid
sequenceDiagram
    participant MQTT as ESP32 / Telemetry Publisher
    participant Ingest as MQTT Ingestion (`mqtt_ingest.py`)
    participant Supabase as Supabase Database Client (`supabase_client.py`)
    participant HistDB as history_data Table
    participant LiveDB as live_data Table

    MQTT->>Ingest: Incoming telemetry payload (V: 10.9V, I: 1.2A, Spd: 15km/h)
    Ingest->>Supabase: update_live_data(telemetry)
    Supabase->>LiveDB: .upsert(payload) on id=1 (Lacks on_conflict="id" / fallback update)
    LiveDB-->>Supabase: Conflicts ignored / Row id=1 NOT UPDATED (Fails silently)
    Ingest->>Supabase: insert_history_data(telemetry)
    Supabase->>HistDB: .insert(payload)
    HistDB-->>Supabase: Row inserted successfully (#2982)
    Note over LiveDB,HistDB: history_data updates with new rows; live_data table remains frozen
```

---

## 4. Scope & Affected Files Summary

| Component | File Path | Line(s) | Role in Bug / Recommended Fix Target |
|---|---|---|---|
| Supabase Client | [supabase_client.py](file:///home/ben10_balaji/V2/backend/supabase_client.py#L231-L248) | Lines 231–248 | Modify `update_live_data()` to use `on_conflict="id"` in `.upsert(payload, on_conflict="id")` OR perform `.update(payload).eq("id", 1)` with fallback `.insert()` if row 1 does not exist |
| MQTT Ingest | [mqtt_ingest.py](file:///home/ben10_balaji/V2/backend/mqtt_ingest.py#L123-L148) | Lines 123–148 | Verify return status of `update_live_data()` and log success/failure explicitly |
| Pipeline Server | [server.py](file:///home/ben10_balaji/V2/backend/server.py#L203-L216) | Lines 203–216 | Ensure live pipeline cycle updates `live_data` record cleanly |

---

## 5. Audit Confidence Level

**Confidence:** **HIGH (Empirically verified with live Supabase database queries — `.update(payload).eq("id", 1)` succeeded whereas plain `.upsert(payload)` failed to update `live_data` row 1)**
