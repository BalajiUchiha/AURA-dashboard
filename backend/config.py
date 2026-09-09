"""
config.py — Environment variable loader & validation.

Fails fast on startup if any required variable is missing.
Optional variables have sensible defaults for a college prototype.
"""

import os
import sys
from dotenv import load_dotenv

# ── Load .env from the same directory as this file ────────────────────
_here = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_here, ".env"))

# ── Required env vars ─────────────────────────────────────────────────
REQUIRED = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "OPENCHARGEMAP_API_KEY",
    "GROQ_API_KEY",
]

_missing = [k for k in REQUIRED if not os.getenv(k)]
if _missing:
    print(f"\n❌  Missing required environment variables:\n   {', '.join(_missing)}\n")
    print("   Copy .env.example → .env and fill in the values.\n")
    sys.exit(1)

# ── Exported config ───────────────────────────────────────────────────
SUPABASE_URL        = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
OPENCHARGEMAP_API_KEY = os.environ["OPENCHARGEMAP_API_KEY"]
GROQ_API_KEY        = os.environ["GROQ_API_KEY"]
GEMINI_API_KEY      = os.getenv("GEMINI_API_KEY", "")  # optional legacy

# Polling and table insertion intervals (seconds)
POLL_INTERVAL_S           = float(os.getenv("POLL_INTERVAL_S", "2.5"))
LIVE_INSERT_INTERVAL_S    = float(os.getenv("LIVE_INSERT_INTERVAL_S", "2.5"))
HISTORY_INSERT_INTERVAL_S = float(os.getenv("HISTORY_INSERT_INTERVAL_S", "5.0"))

# Number of recent rows to fetch for trend analysis
HISTORY_WINDOW      = int(os.getenv("HISTORY_WINDOW", "10"))

# Fixed GPS coordinates (Chennai — update when GPS is wired in)
FIXED_LAT           = float(os.getenv("FIXED_LAT", "13.0827"))
FIXED_LON           = float(os.getenv("FIXED_LON", "80.2707"))

# Total pack battery energy capacity (Wh) for percentage calculation
BATTERY_ENERGY_WH   = float(os.getenv("BATTERY_ENERGY_WH", "25.0"))

# Battery Pack Voltage Parameters (Default 10.6V pack capacity baseline: 10.6V full, 8.4V empty, 9.0V low cutoff)
PACK_V_FULL         = float(os.getenv("PACK_V_FULL", "10.6"))
PACK_V_EMPTY        = float(os.getenv("PACK_V_EMPTY", "8.4"))
LOW_VOLTAGE_CUTOFF  = float(os.getenv("LOW_VOLTAGE_CUTOFF", "9.0"))

# Adjusted range below this triggers alert warning
LOW_RANGE_THRESHOLD_KM = float(os.getenv("LOW_RANGE_THRESHOLD_KM", "2.0"))

# Path to model artifacts (relative to this file)
MODEL_PKL_PATH      = os.path.join(_here, "degradation_model.pkl")
MODEL_METADATA_PATH = os.path.join(_here, "model_metadata.json")

# Min interval (seconds) between Gemini API calls
JARVIS_MIN_CALL_INTERVAL_SECONDS = int(os.getenv("JARVIS_MIN_CALL_INTERVAL_SECONDS", "30"))

# Gemini model identifier (legacy fallback)
GEMINI_MODEL        = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

# Groq model identifier (primary)
GROQ_MODEL          = os.getenv("GROQ_MODEL", "groq/compound")
GROQ_API_URL        = "https://api.groq.com/openai/v1/chat/completions"

# ── MQTT Ingestion (HiveMQ Cloud / Broker) ─────────────────────────────
MQTT_BROKER_HOST    = os.getenv("MQTT_BROKER_HOST", "")
MQTT_BROKER_PORT    = int(os.getenv("MQTT_BROKER_PORT", "8883"))
MQTT_USERNAME       = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD       = os.getenv("MQTT_PASSWORD", "")
MQTT_TOPIC          = os.getenv("MQTT_TOPIC", "aura/vehicle/data")

# ── ElevenLabs TTS (optional — /tts endpoint returns 503 if missing) ──
ELEVENLABS_API_KEY  = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")  # default: "George" (British Male)

