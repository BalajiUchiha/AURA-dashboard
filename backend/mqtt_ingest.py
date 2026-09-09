"""
mqtt_ingest.py — Event-driven MQTT telemetry ingestion module for AURA.

Replaces Node-RED by connecting directly to the HiveMQ Cloud broker,
subscribing to vehicle telemetry, and performing dual writes to Supabase:
  1. UPDATE live_data WHERE id=1
  2. INSERT INTO history_data (...)

Runs as a background thread managed via paho-mqtt's loop_start().
"""

import json
import logging
import os
import ssl
import time
from datetime import datetime, timezone
from typing import Optional

import paho.mqtt.client as mqtt

import config as cfg
import supabase_client

# ── Logger setup ──────────────────────────────────────────────────────
logger = logging.getLogger("mqtt_ingest")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(asctime)s] [MQTT] [%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)

# ── Throttle: live_data and history_data intervals (seconds) ─────────
LIVE_INSERT_INTERVAL_S = float(getattr(cfg, "LIVE_INSERT_INTERVAL_S", 2.5))
HISTORY_INSERT_INTERVAL_S = float(getattr(cfg, "HISTORY_INSERT_INTERVAL_S", 5.0))

_last_valid_voltage: float = 10.5

# ── Global State ──────────────────────────────────────────────────────
_client: Optional[mqtt.Client] = None
_is_connected: bool = False
_last_message_timestamp: Optional[str] = None
_last_live_insert_time: float = 0.0
_last_history_insert_time: float = 0.0


def is_mqtt_connected() -> bool:
    """Return whether the MQTT client is currently connected to the broker."""
    return _is_connected


def get_last_mqtt_message_timestamp() -> Optional[str]:
    """Return ISO string of the last received valid MQTT message timestamp."""
    return _last_message_timestamp


def _on_connect(client, userdata, flags, rc, properties=None):
    """Callback when client connects or reconnects to the MQTT broker."""
    global _is_connected
    # Handle both paho-mqtt v1 (int rc) and v2 (ReasonCode object)
    return_code = getattr(rc, "value", rc)
    if return_code == 0:
        _is_connected = True
        logger.info(f"Connected successfully to MQTT broker at {cfg.MQTT_BROKER_HOST}:{cfg.MQTT_BROKER_PORT}")
        topic = cfg.MQTT_TOPIC
        client.subscribe(topic)
        logger.info(f"Subscribed to topic: '{topic}'")
    else:
        _is_connected = False
        logger.warning(f"MQTT connection failed with return code {return_code}")


def _on_disconnect(client, userdata, *args, **kwargs):
    """Callback when client is disconnected from the MQTT broker."""
    global _is_connected
    _is_connected = False
    rc = args[0] if args else kwargs.get("rc", 0)
    return_code = getattr(rc, "value", rc)
    if return_code != 0:
        logger.warning(f"Unexpected MQTT disconnect (code {return_code}). Paho auto-reconnect active.")
    else:
        logger.info("MQTT client disconnected gracefully.")


def _on_message(client, userdata, msg):
    """Callback when a telemetry payload is published to the subscribed topic."""
    global _last_message_timestamp, _last_live_insert_time, _last_history_insert_time, _last_valid_voltage
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        raw_payload = msg.payload.decode("utf-8")
        data = json.loads(raw_payload)

        # Expected ESP32 telemetry fields with flexible key alias fallbacks
        speed_val = float(data.get("speed") if data.get("speed") is not None else data.get("spd", 0.0))
        rpm_val = float(data.get("rpm", 0.0))
        dist_val = float(data.get("distance_m") if data.get("distance_m") is not None else data.get("distance", 0.0))
        raw_volt = float(data.get("voltage") if data.get("voltage") is not None else data.get("v", 0.0))
        norm_v = cfg.normalize_pack_voltage(raw_volt)
        if norm_v is not None:
            _last_valid_voltage = norm_v
        volt_val = norm_v if norm_v is not None else _last_valid_voltage
        curr_val = float(data.get("current_a") if data.get("current_a") is not None else (data.get("current") if data.get("current") is not None else data.get("c", 0.0)))
        pwr_val = float(data.get("power_w") if data.get("power_w") is not None else data.get("power", 0.0))
        eng_val = float(data.get("energy_wh") if data.get("energy_wh") is not None else data.get("energy", 0.0))
        epk_val = float(data.get("energy_per_km") if data.get("energy_per_km") is not None else data.get("energy_km", 0.0))
        if epk_val < 15.0 or epk_val > 100.0:
            epk_val = 20.0
        rem_val = float(data.get("remaining_wh") if data.get("remaining_wh") is not None else data.get("remaining", 0.0))
        rng_val = float(data.get("range_km") if data.get("range_km") is not None else data.get("range", 0.0))
        grad_val = float(data.get("gradient", 0.0))
        tilt_val = float(data.get("tilt", 0.0))

        telemetry = {
            "speed": speed_val,
            "rpm": rpm_val,
            "distance_m": dist_val,
            "voltage": volt_val,
            "current_a": curr_val,
            "power_w": pwr_val,
            "energy_wh": eng_val,
            "energy_per_km": epk_val,
            "remaining_wh": rem_val,
            "range_km": rng_val,
            "gradient": grad_val,
            "tilt": tilt_val,
            "created_at": now_iso,
        }

        # Throttle live_data updates to 2.5s interval
        now_mono = time.monotonic()
        live_res = None
        if now_mono - _last_live_insert_time >= LIVE_INSERT_INTERVAL_S:
            live_res = supabase_client.update_live_data(telemetry)
            if live_res is not None:
                _last_live_insert_time = now_mono

        # Throttle history_data inserts to avoid DB flooding
        elapsed = now_mono - _last_history_insert_time
        hist_res = None
        if elapsed >= HISTORY_INSERT_INTERVAL_S:
            hist_res = supabase_client.insert_history_data(telemetry)
            if hist_res is not None:
                _last_history_insert_time = now_mono

        if hist_res is not None:
            _last_message_timestamp = now_iso
            row_id = hist_res.get("id")
            inserted_at = hist_res.get("created_at", now_iso)
            logger.info(
                f"✅ [MQTT->DB] Inserted history row #{row_id} at {inserted_at} | "
                f"V: {telemetry['voltage']}V, I: {telemetry['current_a']}A, "
                f"Spd: {telemetry['speed']} km/h (throttle: {HISTORY_INSERT_INTERVAL_S}s)"
            )
        elif live_res is not None:
            _last_message_timestamp = now_iso
            logger.info(f"✅ [MQTT->DB] Updated live_data (id=1) | V: {telemetry['voltage']}V, I: {telemetry['current_a']}A, Spd: {telemetry['speed']} km/h")
        else:
            logger.warning(f"⚠️ [MQTT->DB FAILED] Failed DB writes for payload at {now_iso}")

    except json.JSONDecodeError as e:
        logger.error(f"Malformed JSON payload on topic '{msg.topic}': {e}")
    except Exception as e:
        logger.error(f"Error processing MQTT message: {e}")


def start_mqtt_ingest() -> bool:
    """Initialize and start the background MQTT listener thread."""
    global _client, _is_connected

    if not cfg.MQTT_BROKER_HOST:
        logger.info("MQTT_BROKER_HOST not configured. Background MQTT ingestion skipped.")
        return False

    try:
        # Create client compatible with both paho-mqtt 1.x and 2.x
        try:
            client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id=f"aura-backend-{int(time.time())}",
            )
        except AttributeError:
            client = mqtt.Client(client_id=f"aura-backend-{int(time.time())}")

        # Set callbacks
        client.on_connect = _on_connect
        client.on_disconnect = _on_disconnect
        client.on_message = _on_message

        # Configure TLS for HiveMQ Cloud / SSL brokers (port 8883)
        if cfg.MQTT_BROKER_PORT == 8883 or "emqxp.com" in cfg.MQTT_BROKER_HOST:
            client.tls_set(cert_reqs=ssl.CERT_NONE)
            client.tls_insecure_set(True)


        # Authentication if provided
        if cfg.MQTT_USERNAME:
            client.username_pw_set(cfg.MQTT_USERNAME, cfg.MQTT_PASSWORD)

        # Connect asynchronously and start thread loop
        logger.info(f"Connecting to MQTT broker {cfg.MQTT_BROKER_HOST}:{cfg.MQTT_BROKER_PORT}...")
        client.connect_async(cfg.MQTT_BROKER_HOST, port=cfg.MQTT_BROKER_PORT, keepalive=60)
        client.loop_start()

        _client = client
        return True

    except Exception as e:
        logger.error(f"Failed to start MQTT client: {e}")
        _is_connected = False
        return False


def stop_mqtt_ingest():
    """Stop the background MQTT thread and disconnect client."""
    global _client, _is_connected
    if _client is not None:
        try:
            _client.loop_stop()
            _client.disconnect()
            logger.info("MQTT client stopped.")
        except Exception as e:
            logger.warning(f"Error stopping MQTT client: {e}")
        finally:
            _client = None
            _is_connected = False
