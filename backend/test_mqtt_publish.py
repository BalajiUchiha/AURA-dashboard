"""
test_mqtt_publish.py — Simulates ESP32 vehicle telemetry publishing over MQTT.

Connects to the configured HiveMQ Cloud broker using config.py settings
and publishes sample telemetry JSON payload to test the backend mqtt_ingest module.
"""

import json
import ssl
import sys
import time
import paho.mqtt.client as mqtt

import config as cfg

def run_test_publisher():
    host = cfg.MQTT_BROKER_HOST
    port = cfg.MQTT_BROKER_PORT
    topic = cfg.MQTT_TOPIC

    if not host:
        print("❌ Error: MQTT_BROKER_HOST is not set in environment or .env file.")
        print("   Set MQTT_BROKER_HOST in backend/.env to run this test.")
        sys.exit(1)

    print(f"🚀 Starting MQTT Test Publisher...")
    print(f"   Broker: {host}:{port}")
    print(f"   Topic:  {topic}")

    try:
        try:
            client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id=f"aura-test-publisher-{int(time.time())}"
            )
        except AttributeError:
            client = mqtt.Client(client_id=f"aura-test-publisher-{int(time.time())}")

        if port == 8883 or "emqxp.com" in host:
            client.tls_set(cert_reqs=ssl.CERT_NONE)
            client.tls_insecure_set(True)


        if cfg.MQTT_USERNAME:
            client.username_pw_set(cfg.MQTT_USERNAME, cfg.MQTT_PASSWORD)

        print(f"   Connecting to {host}...")
        client.connect(host, port=port, keepalive=60)
        client.loop_start()

        # Simulate ESP32 telemetry packet
        test_payload = {
            "speed": 48.5,
            "rpm": 1320,
            "distance_m": 3200.0,
            "voltage": 43.8,
            "current_a": 22.4,
            "power_w": 981.12,
            "energy_wh": 160.5,
            "energy_per_km": 88.2,
            "remaining_wh": 439.5,
            "range_km": 14.8,
            "gradient": 1.5,
            "tilt": 0.8,
        }

        payload_json = json.dumps(test_payload)
        print(f"   Publishing test packet to '{topic}':")
        print(f"   {payload_json}")

        info = client.publish(topic, payload_json, qos=1)
        info.wait_for_publish(timeout=10)

        print("✅ Message successfully published to broker!")
        time.sleep(2)
        client.loop_stop()
        client.disconnect()
        print("   Publisher finished cleanly.")

    except Exception as e:
        print(f"❌ MQTT Publish failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_test_publisher()
