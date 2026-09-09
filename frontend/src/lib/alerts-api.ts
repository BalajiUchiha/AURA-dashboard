import { API_BASE } from "./aura-api";

export interface AlertEntry {
  timestamp: string;
  alert_flag: "critical" | "warning" | "info" | string;
  jarvis_message: string;
  alert_message: string;
  degradation_percent?: number;
  voltage?: number;
  current_a?: number;
  had_charging_suggestion?: boolean;
}

export interface AlertsResponse {
  status?: string;
  alerts?: AlertEntry[];
}

/** GET /alerts?limit=30[&severity=critical|warning] */
export async function getAlerts(
  limit = 30,
  severity?: string,
  signal?: AbortSignal,
): Promise<AlertsResponse> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (severity) q.set("severity", severity);
  const res = await fetch(`${API_BASE}/alerts?${q}`, signal ? { signal } : {});
  if (!res.ok) throw new Error(`GET /alerts failed: ${res.status}`);
  return (await res.json()) as AlertsResponse;
}

/** Simulated alert log used only when the backend is unreachable. */
export function demoAlerts(tick: number, severity?: string): AlertsResponse {
  const pool: Omit<AlertEntry, "timestamp">[] = [
    {
      alert_flag: "critical",
      jarvis_message:
        "Battery degradation is accelerating. I recommend reducing speed below 80 km/h and routing to a charging station within the next 25 kilometres.",
      alert_message: "degradation_percent exceeded critical threshold (12.4%)",
      degradation_percent: 12.4,
      voltage: 368.2,
      current_a: 142.5,
      had_charging_suggestion: true,
    },
    {
      alert_flag: "warning",
      jarvis_message:
        "Sustained high current draw detected over the last 3 minutes. Ease off acceleration to preserve remaining range.",
      alert_message: "current_a sustained above 120A",
      degradation_percent: 8.1,
      voltage: 381.6,
      current_a: 128.9,
      had_charging_suggestion: false,
    },
    {
      alert_flag: "warning",
      jarvis_message:
        "Adjusted range has dropped 18 km below baseline this session. Primary contributor: high-speed driving.",
      alert_message: "range gap > 15 km",
      degradation_percent: 7.3,
      voltage: 384.1,
      current_a: 96.2,
      had_charging_suggestion: false,
    },
    {
      alert_flag: "info",
      jarvis_message:
        "All systems nominal. Driving efficiency is 4% above your session average — nice work.",
      alert_message: "periodic status report",
      degradation_percent: 5.2,
      voltage: 396.8,
      current_a: 61.4,
      had_charging_suggestion: false,
    },
    {
      alert_flag: "critical",
      jarvis_message:
        "Motor temperature is approaching the safe operating limit. I've located a charging station 3.2 km ahead where you can stop safely.",
      alert_message: "motor_temp_c > 78°C",
      degradation_percent: 9.6,
      voltage: 372.3,
      current_a: 118.7,
      had_charging_suggestion: true,
    },
    {
      alert_flag: "info",
      jarvis_message:
        "Regenerative braking recovered 0.4 kWh in the last 10 minutes of city driving.",
      alert_message: "regen summary",
      degradation_percent: 4.9,
      voltage: 398.1,
      current_a: 22.3,
      had_charging_suggestion: false,
    },
  ];
  const now = Date.now();
  const alerts = pool
    .filter((a) => !severity || a.alert_flag === severity)
    .map((a, i) => ({
      ...a,
      timestamp: new Date(now - (i * 7 + (tick % 5)) * 60_000).toISOString(),
    }));
  return { alerts };
}
