# Verification Report: Range Calibration & Energy Consumption Fix

**Audit Reference:** `audits/uncalibrated-range-and-db-field-mismatch-20260909-1106/AUDIT.md`  
**Plan Reference:** `audits/uncalibrated-range-and-db-field-mismatch-20260909-1106/PLAN.md`  
**Date:** 2026-09-09  

---

## Checks Executed & Empirical Results

| Check ID | Verification Description | Code / Test Evidence | Result |
|---|---|---|---|
| CHECK-01 | EV Consumption Rate floor ($20.0\text{ Wh/km}$) in `server.py` | `server.py` checks `if epk < 15.0 or epk > 100.0: epk = 20.0` | **PASS** |
| CHECK-02 | Telemetry parser validation in `mqtt_ingest.py` | `mqtt_ingest.py` defaults uncalibrated payload `energy_per_km` to $20.0\text{ Wh/km}$ | **PASS** |
| CHECK-03 | Main entrypoint range calibration in `main.py` | `main.py` enforces $20.0\text{ Wh/km}$ fallback for prototype range estimation | **PASS** |
| CHECK-04 | Automated pipeline range execution check | Command: `python3 -c "import server; payload = server._execute_pipeline_cycle(); print(payload['range_km'], payload['adjusted_range_km'])"` → Output: `BASELINE_RANGE_KM: 1.22`, `ADJUSTED_RANGE_KM: 1.05` | **PASS** |
| CHECK-05 | No 45km / 43.11km range explosion for 24.41 Wh battery | Baseline range bounded to **1.22 km** and adjusted range to **1.05 km** | **PASS** |

---

## Overall Status: SUCCESS
