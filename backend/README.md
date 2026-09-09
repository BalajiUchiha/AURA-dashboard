# AURA EV Backend Service (Python / FastAPI)

Automated Python backend service for the **AURA EV Co-Pilot & Range Predictor**.

## Architecture & Modules
- `server.py`: Primary entrypoint. Runs FastAPI server and continuous background loop (`asyncio`).
- `main.py`: Standalone console loop (kept as fallback/debugging script).
- `supabase_client.py`: Supabase database connection for reading `history_data` and writing `insights`.
- `ekf_filter.py`: 2-state Extended Kalman Filter for voltage, current, and speed signal smoothing.
- `alert_engine.py`: Rule-based alert detection (thermal stress, unusual power draw, low battery).
- `ml_predictor.py`: Local `degradation_model.pkl` predictor with direct feature engineering reuse (`features.py`).
- `charging_lookup.py`: OpenChargeMap API connector for nearest charging station queries.
- `jarvis_client.py`: Gemini LLM (`gemini-2.5-flash`) integration with JARVIS system instructions.

---

## Getting Started

### 1. Requirements & Setup
Make sure Python dependencies are installed and `.env` is configured with API keys:

```bash
pip install -r requirements.txt
```

`.env` configuration:
```env
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
OPENCHARGEMAP_API_KEY=your-openchargemap-key
GEMINI_API_KEY=your-gemini-key
FIXED_LAT=13.0827
FIXED_LON=80.2707
POLL_INTERVAL_S=5
HISTORY_WINDOW=10
LOW_RANGE_THRESHOLD_KM=2.0
```

### 2. Running the Server

To start the FastAPI backend server on port `8000`:

```bash
python3 server.py
```

Or using `uvicorn`:
```bash
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

---

## API Endpoints Reference

Base URL: `http://localhost:8000`

### 1. `GET /latest`
Returns the combined live vehicle telemetry + latest EKF, ML degradation, alert, and JARVIS message.
- **Response right after boot**: `{ "status": "warming_up" }`
- **Response after first cycle**:
```json
{
  "timestamp": "2026-09-06T23:00:00+00:00",
  "vehicle": {
    "speed": 14.5,
    "rpm": 1250,
    "distance_m": 1650.0,
    "voltage": 10.8,
    "current_a": 1.2,
    "power_w": 12.96,
    "energy_wh": 130.0,
    "energy_per_km": 87.0,
    "remaining_wh": 470.0,
    "range_km": 1.7,
    "gradient": 2.5,
    "tilt": 1.0
  },
  "filtered": {
    "voltage": 10.82,
    "voltage_rate": -0.001,
    "current": 1.21,
    "current_rate": 0.002,
    "speed": 14.48,
    "speed_rate": 0.005
  },
  "prediction": {
    "degradation_percent": 12.4,
    "confidence": "high",
    "primary_factor": "c_rate",
    "adjusted_range_km": 1.49
  },
  "alert": {
    "alert_flag": "low_battery",
    "alert_message": "Low battery voltage warning: Filtered voltage is 9.40V (< 9.5V threshold).",
    "severity": "critical"
  },
  "charging_station": {
    "name": "FastCharge Station",
    "distance_km": 0.85,
    "address": "123 EV Way, Chennai"
  },
  "jarvis_message": "Battery levels are running low. I have routed you to FastCharge Station, located 0.85 km away."
}
```

### 2. `GET /history?limit=N`
Returns last N insights rows (default: 20, min: 1, max: 200) ordered oldest to newest for trend charting.

### 3. `GET /alerts?limit=N`
Returns last N active alerts where `alert_flag != 'none'` (default: 10).

### 4. `GET /health`
Returns server & background loop status:
```json
{
  "status": "ok",
  "background_loop_running": true,
  "last_cycle_timestamp": "2026-09-06T23:00:00+00:00",
  "last_cycle_error": null
}
```

### 5. `WebSocket /ws/live`
Pushes the `/latest` JSON payload to connected clients automatically whenever a new pipeline cycle completes.
