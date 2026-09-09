"""
jarvis_client.py — Groq-powered JARVIS co-pilot for AURA EV.

JARVIS is an AI co-pilot that translates raw vehicle telemetry + alerts
into calm, confident, driver-friendly language.

Primary backend: Groq (llama-3.3-70b-versatile) via OpenAI-compatible API.

Export:
    get_jarvis_message(vehicle_data, alert_info, degradation_info,
                       station_info, verbose_log=True, force_call=False) → str
    reset_jarvis_state() → None
"""

import time
import json
import httpx
import re
import config as cfg

# ── Groq endpoint ─────────────────────────────────────────────────────
GROQ_API_URL = cfg.GROQ_API_URL
GROQ_API_KEY = cfg.GROQ_API_KEY

# ── Rate limiting shared state ─────────────────────────────────────────
_last_alert_flag: str | None = None
_last_call_time: float = 0.0
_last_jarvis_message: str | None = None


def reset_jarvis_state() -> None:
    """Reset rate limiting shared state (useful for unit tests & resets)."""
    global _last_alert_flag, _last_call_time, _last_jarvis_message
    _last_alert_flag = None
    _last_call_time = 0.0
    _last_jarvis_message = None


# ── System instructions ──────────────────────────────────────────────
SYSTEM_PROMPT = (
    "You are JARVIS, an AI co-pilot for an electric vehicle prototype. "
    "The vehicle operates on a 10.6V battery pack capacity baseline (supporting up to 11.0V max capacity threshold). "
    "Explain technical issues, battery health, and estimated runtime to the driver in simple, calm, confident language. "
    "Be concise — 2-3 sentences max. Focus on vehicle status, capacity remaining, estimated runtime, and driver guidance. "
    "Do not mention or suggest any charging station."
)

# ── Fallback message ─────────────────────────────────────────────────
FALLBACK_MSG = "JARVIS is momentarily unavailable. Monitoring continues."


def _build_user_prompt(
    vehicle_data: dict,
    alert_info: dict,
    degradation_info: dict | None,
    station_info: dict | None = None,
) -> str:
    """Build a structured user prompt from all available context."""
    v_full = getattr(cfg, "PACK_V_FULL", 10.6)
    lines = [f"── Current Vehicle Status (EKF-filtered, Pack Spec: {v_full}V baseline / 11V max) ──"]

    for key, label, unit in [
        ("speed", "Speed", "km/h"),
        ("voltage", "Voltage", "V"),
        ("current_a", "Current", "A"),
        ("power_w", "Power", "W"),
        ("energy_wh", "Energy used", "Wh"),
        ("remaining_wh", "Remaining energy", "Wh"),
        ("capacity_remaining_percent", "Capacity remaining", "%"),
        ("estimated_runtime_seconds", "Estimated runtime", "s"),
        ("range_km", "Estimated range", "km"),
        ("gradient", "Gradient", "°"),
        ("tilt", "Tilt", "°"),
    ]:
        val = vehicle_data.get(key)
        if val is not None:
            lines.append(f"{label}: {val} {unit}")

    lines.append("")
    lines.append("── Alert ──")
    lines.append(f"Flag: {alert_info.get('alert_flag', 'none')}")
    lines.append(f"Details: {alert_info.get('alert_message', 'N/A')}")

    if degradation_info:
        lines.append("")
        lines.append("── Battery Degradation Analysis ──")
        lines.append(f"Degradation: {degradation_info.get('degradation_percent', '—')}%")
        lines.append(f"Confidence: {degradation_info.get('confidence', '—')}")
        lines.append(f"Primary factor: {degradation_info.get('primary_factor', '—')}")

    lines.append("")
    lines.append("Give the driver a brief, natural update based on the above.")

    return "\n".join(lines)


def _call_groq(system_prompt: str, user_prompt: str, model: str, verbose_log: bool = True) -> str | None:
    """
    Call Groq's OpenAI-compatible chat completion endpoint.
    Returns extracted text or None on failure.
    """
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 300,
        "temperature": 0.7,
    }

    try:
        response = httpx.post(
            GROQ_API_URL,
            headers=headers,
            json=payload,
            timeout=15.0,
        )

        if verbose_log:
            print(f"  MODEL USED: {model}")
            print(f"  HTTP STATUS: {response.status_code}")

        if response.status_code != 200:
            err_body = response.text[:300]
            if verbose_log:
                print(f"  ⚠️ Groq API error ({response.status_code}): {err_body}")
            return None

        data = response.json()
        choices = data.get("choices", [])
        if not choices:
            if verbose_log:
                print("  ⚠️ Groq returned no choices")
            return None

        text = choices[0].get("message", {}).get("content", "").strip()
        if "<think>" in text:
            text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
        finish_reason = choices[0].get("finish_reason", "unknown")

        if verbose_log:
            print(f"  FINISH REASON: {finish_reason}")
            print(f"  EXTRACTED TEXT ({len(text)} chars):")
            print(f"    {text[:200]}{'...' if len(text) > 200 else ''}")
            usage = data.get("usage", {})
            print(f"  TOKENS: prompt={usage.get('prompt_tokens', '?')}, "
                  f"completion={usage.get('completion_tokens', '?')}, "
                  f"total={usage.get('total_tokens', '?')}")
            print("─" * 60)

        return text if text else None

    except httpx.TimeoutException:
        if verbose_log:
            print(f"  ⚠️ Groq API timeout (15s)")
        return None
    except Exception as e:
        if verbose_log:
            print(f"  ⚠️ Groq API error: {e}")
        return None


def _validate_response(text: str | None, system_prompt: str) -> bool:
    """Validate that the response is a proper JARVIS message."""
    if not text:
        return False
    if len(text) < 20:
        return False
    if text.replace(".", "").replace("-", "").isdigit():
        return False
    if text in system_prompt:
        return False
    if text.startswith("correction:"):
        return False
    if "Do not mention or suggest" in text:
        return False
    return True


def get_jarvis_message(
    vehicle_data: dict,
    alert_info: dict,
    degradation_info: dict | None = None,
    station_info: dict | None = None,
    verbose_log: bool = False,
    force_call: bool = False,
) -> str:
    """
    Call Groq to get a JARVIS-style message for the driver.
    Includes rate-limiting throttling (only calls API if alert_flag changes or min
    interval elapsed), fallback message reuse, and retry on failure.
    """
    global _last_alert_flag, _last_call_time, _last_jarvis_message

    current_alert_flag = alert_info.get("alert_flag", "none")
    now = time.time()
    time_since_last_call = now - _last_call_time
    min_interval = getattr(cfg, "JARVIS_MIN_CALL_INTERVAL_SECONDS", 30)

    alert_changed = (_last_alert_flag is None) or (current_alert_flag != _last_alert_flag)
    interval_reached = time_since_last_call >= min_interval
    has_previous_msg = (_last_jarvis_message is not None) and (_last_jarvis_message != FALLBACK_MSG)

    # Determine if we should call the LLM or throttle
    should_call = force_call or alert_changed or interval_reached or (not has_previous_msg)

    if not should_call:
        if verbose_log:
            print("\n" + "─" * 60)
            print(f"  ⏱️  [JARVIS RATE LIMIT] Alert flag '{current_alert_flag}' unchanged and "
                  f"only {time_since_last_call:.1f}s elapsed (< {min_interval}s threshold).")
            print("  🔄 Reusing previous JARVIS message for this cycle.")
            print("─" * 60)
        return _last_jarvis_message

    user_prompt = _build_user_prompt(
        vehicle_data, alert_info, degradation_info, station_info
    )

    if verbose_log:
        reason_str = (
            "alert_flag change" if alert_changed else
            f"interval threshold ({time_since_last_call:.1f}s >= {min_interval}s)" if interval_reached else
            "initial call / refresh"
        )
        print("\n" + "─" * 60)
        print(f"  🤖 [GROQ API REQUEST LOG - Trigger: {reason_str}]")
        print("  SYSTEM PROMPT:")
        print("    " + SYSTEM_PROMPT.replace("\n", "\n    "))
        print("  USER PROMPT:")
        print("    " + user_prompt.replace("\n", "\n    "))

    # Try primary model, then fallback
    models_to_try = [
        cfg.GROQ_MODEL,                    # primary: groq/compound
        "openai/gpt-oss-120b",             # high capability fallback
        "qwen/qwen3.6-27b",                # fast fallback
        "groq/compound-mini",              # mini fallback
    ]

    for model_name in models_to_try:
        text = _call_groq(SYSTEM_PROMPT, user_prompt, model_name, verbose_log)
        if _validate_response(text, SYSTEM_PROMPT):
            _last_alert_flag = current_alert_flag
            _last_call_time = time.time()
            _last_jarvis_message = text
            return text
        else:
            if verbose_log and text:
                print(f"  ⚠️ Response from '{model_name}' failed validation: '{text[:80]}...' — trying next model.")

    # If all models failed
    print(f"  ❌ Groq API call failed on all models.")
    _last_call_time = time.time()  # prevent hammering

    if has_previous_msg:
        if verbose_log:
            print("  🔄 Reusing previous valid JARVIS message following API error.")
        return _last_jarvis_message

    _last_jarvis_message = FALLBACK_MSG
    return FALLBACK_MSG
