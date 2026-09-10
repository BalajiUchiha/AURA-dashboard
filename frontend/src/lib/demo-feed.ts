import type { AuraTelemetry } from "./aura-types";
import type { SimulatedEventScenario } from "@/components/aura/ScenarioModal";

export const SIMULATED_SCENARIOS: SimulatedEventScenario[] = [
  {
    id: 1,
    title: "Scenario 1: Nominal Pack Cruising (10.0V Baseline)",
    subtitle: "Full charge baseline operating envelope",
    briefing: "Vehicle operating at full 10.0V pack baseline. Telemetry shows smooth 15 km/h cruising with nominal current draw and zero EKF noise divergence.",
    auraWorkflow: "AURA EKF filter confirms 100% state-of-charge (10.0V). Range prediction establishes 1.50 km baseline with 8 minutes of runtime. JARVIS AI co-pilot reports all systems nominal.",
    telemetry: {
      status: "ok",
      speed: 15,
      voltage: 10.0,
      range_km: 1.50,
      adjusted_range_km: 1.50,
      baseline_range_km: 1.50,
      battery_pct: 100,
      capacity_remaining_percent: 100,
      estimated_runtime_seconds: 480,
      degradation_percent: 0.0,
      primary_factor: "Nominal Load",
      range_factors: { temp_sag: 0.0, resistance: 0.0 },
      motor_temp_c: 28,
      alert: { alert_flag: null, alert_message: null, severity: "info" },
      jarvis_message: "Battery health nominal. Operating at 10.0V full charge baseline. Estimated runtime is 8 minutes.",
      charging_station: null,
    },
  },
  {
    id: 2,
    title: "Scenario 2: Acceleration Under Load & Voltage Sag (8.0V)",
    subtitle: "Heavy current draw causing transient pack sag",
    briefing: "Vehicle accelerating under high current draw (2.8A). Cell voltage drops to 8.0V due to load intensity sag.",
    auraWorkflow: "AURA degradation model calculates elevated load intensity. Battery capacity updates to 80.0%, range recalibrates to 1.20 km, and estimated runtime adjusts to 7 minutes.",
    telemetry: {
      status: "ok",
      speed: 22,
      voltage: 8.0,
      range_km: 1.20,
      adjusted_range_km: 1.12,
      baseline_range_km: 1.20,
      battery_pct: 80,
      capacity_remaining_percent: 80,
      estimated_runtime_seconds: 420,
      degradation_percent: 15.4,
      primary_factor: "C-Rate (Load Intensity)",
      range_factors: { temp_sag: 0.05, resistance: 0.08 },
      motor_temp_c: 38,
      alert: {
        alert_flag: "VOLTAGE_SAG",
        alert_message: "Transient voltage drop detected under acceleration load.",
        severity: "warning",
      },
      jarvis_message: "Voltage sag detected under load at 8.0V. Remaining capacity is 80% with an estimated runtime of 7 minutes.",
      charging_station: null,
    },
  },
  {
    id: 3,
    title: "Scenario 3: Low Voltage Threshold & Range Warning (7.0V)",
    subtitle: "Pack depleting near low voltage warning boundary",
    briefing: "Sustained discharge drops pack voltage down to 7.0V. Battery capacity reaches 70.0% with reduced operating headroom.",
    auraWorkflow: "AURA alert engine triggers low-voltage indicator warning. Adjusted range recalibrates to 1.05 km. JARVIS advises conservative driving to preserve remaining energy.",
    telemetry: {
      status: "ok",
      speed: 18,
      voltage: 7.0,
      range_km: 1.05,
      adjusted_range_km: 0.95,
      baseline_range_km: 1.05,
      battery_pct: 70,
      capacity_remaining_percent: 70,
      estimated_runtime_seconds: 420,
      degradation_percent: 22.8,
      primary_factor: "Internal Resistance",
      range_factors: { temp_sag: 0.12, resistance: 0.15 },
      motor_temp_c: 44,
      alert: {
        alert_flag: "LOW_BATTERY",
        alert_message: "Battery voltage reaching 7.0V low threshold.",
        severity: "warning",
      },
      jarvis_message: "Warning: Battery voltage at 7.0V. Capacity is 70% with 7 minutes of runtime remaining. Please reduce acceleration.",
      charging_station: null,
    },
  },
  {
    id: 4,
    title: "Scenario 4: Thermal Stress & Critical Degradation (6.0V)",
    subtitle: "High internal resistance causing rapid voltage decay",
    briefing: "Rising internal resistance causes voltage to drop to 6.0V under continuous load, triggering thermal stress alerts.",
    auraWorkflow: "AURA ML predictor flags 43.5% pack degradation. Capacity drops to 60.0%, range adjusts to 0.90 km, and estimated runtime updates to 6 minutes.",
    telemetry: {
      status: "ok",
      speed: 14,
      voltage: 6.0,
      range_km: 0.90,
      adjusted_range_km: 0.51,
      baseline_range_km: 0.90,
      battery_pct: 60,
      capacity_remaining_percent: 60,
      estimated_runtime_seconds: 360,
      degradation_percent: 43.5,
      primary_factor: "Internal Resistance & Heat",
      range_factors: { temp_sag: 0.18, resistance: 0.25 },
      motor_temp_c: 52,
      alert: {
        alert_flag: "THERMAL_STRESS_INDICATOR",
        alert_message: "High internal resistance and thermal stress detected at 6.0V.",
        severity: "critical",
      },
      jarvis_message: "Critical alert: Voltage at 6.0V with high internal resistance and 43.5% degradation. Estimated runtime is 6 minutes.",
      charging_station: null,
    },
  },
];

export function demoFrame(tick: number): AuraTelemetry {
  const scenario = SIMULATED_SCENARIOS[tick % SIMULATED_SCENARIOS.length];
  const base = scenario.telemetry;
  const jitter = (Math.sin(tick) * 0.05);
  const voltJitter = Math.round((base.voltage! + jitter * 0.1) * 10) / 10;
  const speedJitter = Math.max(0, Math.round(base.speed! + jitter * 2));

  return {
    ...base,
    voltage: voltJitter,
    speed: speedJitter,
    timestamp: new Date().toISOString(),
  };
}
