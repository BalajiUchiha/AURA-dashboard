import type { AuraTelemetry } from "./aura-types";

/**
 * Local simulation used only when the AURA backend is unreachable, so the
 * dashboard always demonstrates its full behaviour instead of rendering empty.
 * Parameterized for the weak fixed pack (7-8V, 0.2 - 0.8 km total range).
 */
const SCRIPT: AuraTelemetry[] = [
  {
    status: "ok",
    speed: 15,
    voltage: 7.8,
    range_km: 0.75,
    adjusted_range_km: 0.71,
    baseline_range_km: 0.80,
    battery_pct: 82,
    capacity_remaining_percent: 82,
    estimated_runtime_seconds: 520,
    degradation_percent: 18.5,
    primary_factor: "sag",
    range_factors: { temp_sag: 0.04, resistance: 0.05 },
    motor_temp_c: 32,
    alert: { alert_flag: null, alert_message: null, severity: "info" },
    jarvis_message: "Battery health nominal. Weak pack operating within expected 7.8V envelope. Estimated runtime is 8 minutes.",
    charging_station: null,
  },
  {
    status: "ok",
    speed: 22,
    voltage: 7.2,
    range_km: 0.48,
    adjusted_range_km: 0.42,
    baseline_range_km: 0.65,
    battery_pct: 54,
    capacity_remaining_percent: 54,
    estimated_runtime_seconds: 310,
    degradation_percent: 24.1,
    primary_factor: "sag",
    range_factors: { temp_sag: 0.08, resistance: 0.12 },
    motor_temp_c: 41,
    alert: {
      alert_flag: "VOLTAGE_SAG",
      alert_message: "Significant voltage drop detected under load. Runtime reduced.",
      severity: "warning",
    },
    jarvis_message:
      "Voltage sag detected under load. Estimated runtime remaining is approximately five minutes.",
    charging_station: null,
  },
  {
    status: "ok",
    speed: 18,
    voltage: 6.3,
    range_km: 0.21,
    adjusted_range_km: 0.16,
    baseline_range_km: 0.35,
    battery_pct: 18,
    capacity_remaining_percent: 18,
    estimated_runtime_seconds: 110,
    degradation_percent: 38.0,
    primary_factor: "sag",
    range_factors: { temp_sag: 0.18, resistance: 0.22 },
    motor_temp_c: 46,
    alert: {
      alert_flag: "LOW_RANGE",
      alert_message: "Weak pack reaching cutoff voltage. Shutdown imminent.",
      severity: "critical",
    },
    jarvis_message:
      "Warning: Pack voltage has dropped to 6.3V. Less than two minutes of runtime remaining before cutoff.",
    charging_station: null,
  },
];

export function demoFrame(tick: number): AuraTelemetry {
  const base = SCRIPT[tick % SCRIPT.length];
  // Add slight noise to keep gauge needles alive
  const jitter = (Math.sin(tick) * 0.05);
  const voltJitter = Math.round((base.voltage! + jitter * 0.2) * 10) / 10;
  const speedJitter = Math.max(0, Math.round(base.speed! + jitter * 2));

  return {
    ...base,
    voltage: voltJitter,
    speed: speedJitter,
    timestamp: new Date().toISOString(),
  };
}
