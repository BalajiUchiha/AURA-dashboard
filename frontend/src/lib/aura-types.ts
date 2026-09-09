export type AlertSeverity = "info" | "warning" | "critical";

export interface AuraAlert {
  alert_flag: string | null;
  alert_message: string | null;
  severity?: AlertSeverity | null;
}

export interface ChargingStation {
  name: string;
  distance_km?: number | null;
  distance?: number | string | null;
  address?: string | null;
}

export interface AuraTelemetry {
  status?: "warming_up" | "ok" | string;
  speed?: number | null;
  voltage?: number | null;
  range_km?: number | null;
  adjusted_range_km?: number | null;
  baseline_range_km?: number | null;
  battery_pct?: number | null;
  capacity_remaining_percent?: number | null;
  estimated_runtime_seconds?: number | null;
  degradation_percent?: number | null;
  primary_factor?: string | null;
  range_factors?: Record<string, number> | null;
  motor_temp_c?: number | null;
  alert?: AuraAlert | null;
  jarvis_message?: string | null;
  charging_station?: ChargingStation | null;
  timestamp?: string | number | null;
}

export type LinkState = "booting" | "live" | "polling" | "reconnecting" | "simulated";
