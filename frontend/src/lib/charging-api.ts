import { API_BASE } from "./aura-api";

export interface RecentStation {
  station_name: string;
  distance_km: number | null;
  timestamp: string;
  lat?: number | null;
  lon?: number | null;
}

export interface ChargingStatus {
  has_active_suggestion: boolean;
  adjusted_range_km: number | null;
  /**
   * Nominal (unadjusted) range for the current charge, used to show WHY the
   * adjusted range differs — the delta + top causes. Optional: when absent the
   * page simply shows the adjusted number with no explanation.
   */
  baseline_range_km?: number | null;
  /**
   * Kilometres lost from the nominal range, keyed by cause
   * (e.g. { "High speed": 24, "Cold ambient": 8 }). Shown as a short list of
   * the top contributors so the driver understands the adjusted number.
   * Values are km lost; ordering is the frontend's (largest first).
   */
  range_factors?: Record<string, number> | null;
  station_name: string | null;
  station_distance_km: number | null;
  station_address: string | null;
  station_lat: number | null;
  station_lon: number | null;
  /** stable per-station id (not coordinates) so the map never reloads mid-stop */
  station_id?: string | null;
  /** seconds until arrival at the suggested station, if provided by backend */
  eta_seconds: number | null;
  /** --- optional richer station detail (backend nice-to-haves) --- */
  battery_percent?: number | null;
  /** predicted state of charge on arrival, percent */
  arrival_battery_percent?: number | null;
  station_network?: string | null;
  station_power_kw?: number | null;
  station_connectors?: string[] | null;
  station_available_stalls?: number | null;
  station_total_stalls?: number | null;
  station_price_per_kwh?: number | null;
  station_is_open?: boolean | null;
  /** minutes of charging needed to reach a comfortable state of charge */
  charge_minutes_to_80?: number | null;
  jarvis_message: string | null;
  recent_stations: RecentStation[];
}

/** GET /charging-status */
export async function getChargingStatus(signal?: AbortSignal): Promise<ChargingStatus> {
  const res = await fetch(`${API_BASE}/charging-status`, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`GET /charging-status failed: ${res.status}`);
  return (await res.json()) as ChargingStatus;
}

/** POST /charging-status/lookup — manual lookup with default coordinates. */
export async function postChargingLookup(): Promise<ChargingStatus> {
  const res = await fetch(`${API_BASE}/charging-status/lookup`, { method: "POST" });
  if (!res.ok) throw new Error(`POST /charging-status/lookup failed: ${res.status}`);
  return (await res.json()) as ChargingStatus;
}

const DEMO_STATIONS: RecentStation[] = [
  { station_name: "Tata Power EZ Charge — Indiranagar", distance_km: 2.4, timestamp: "", lat: 12.9719, lon: 77.6412 },
  { station_name: "Ather Grid — Koramangala", distance_km: 4.1, timestamp: "", lat: 12.9352, lon: 77.6245 },
  { station_name: "ChargeZone — Outer Ring Rd", distance_km: 6.8, timestamp: "", lat: 12.9121, lon: 77.6446 },
];

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Demo charging status; even ticks = no suggestion, odd ticks = active suggestion. */
export function demoChargingStatus(tick: number): ChargingStatus {
  const suggest = tick % 3 === 2;
  const recent = DEMO_STATIONS.map((s, i) => ({ ...s, timestamp: ago(3 + i * 7) }));
  return {
    has_active_suggestion: suggest,
    adjusted_range_km: suggest ? 18.4 : 62.7,
    baseline_range_km: suggest ? 74 : 126,
    range_factors: suggest
      ? { "Low battery": 22, "High speed": 18, "Cold ambient": 8, "HVAC": 5 }
      : { "High speed": 22, "Battery age": 16, "Climate": 12, "Uphill grade": 8, "Aggressive accel": 5 },
    station_id: suggest ? "ather-koramangala-80ft" : null,
    station_name: suggest ? "Ather Grid — Koramangala 80ft Rd" : null,
    station_distance_km: suggest ? 3.2 : null,
    station_address: suggest ? "80 Feet Rd, 4th Block, Koramangala, Bengaluru" : null,
    station_lat: suggest ? 12.9352 : null,
    station_lon: suggest ? 77.6245 : null,
    eta_seconds: suggest ? 6 * 60 + 24 : null,
    battery_percent: suggest ? 11 : 46,
    arrival_battery_percent: suggest ? 6 : null,
    station_network: suggest ? "Ather Grid" : null,
    station_power_kw: suggest ? 60 : null,
    station_connectors: suggest ? ["CCS2", "Type 2"] : null,
    station_available_stalls: suggest ? 2 : null,
    station_total_stalls: suggest ? 4 : null,
    station_price_per_kwh: suggest ? 18.5 : null,
    station_is_open: suggest ? true : null,
    charge_minutes_to_80: suggest ? 32 : null,
    jarvis_message: suggest
      ? "Range is critically low. I've located an Ather Grid fast charger 3.2 km away in Koramangala — rerouting you now. Estimated arrival in about six minutes with range to spare."
      : null,
    recent_stations: recent,
  };
}

/** Demo result for the manual "Check Now" lookup — always returns a suggestion. */
export function demoChargingLookup(): ChargingStatus {
  const base = demoChargingStatus(2);
  return {
    ...base,
    has_active_suggestion: true,
    baseline_range_km: 68,
    range_factors: { "Low battery": 28, "High speed": 14, "Cold ambient": 6 },
    station_id: "tata-indiranagar-100ft",
    station_name: "Tata Power EZ Charge — Indiranagar",
    station_distance_km: 2.4,
    station_address: "100 Feet Rd, Indiranagar, Bengaluru",
    station_lat: 12.9719,
    station_lon: 77.6412,
    eta_seconds: 4 * 60 + 48,
    arrival_battery_percent: 8,
    station_network: "Tata Power",
    station_power_kw: 50,
    station_connectors: ["CCS2"],
    station_available_stalls: 2,
    station_total_stalls: 3,
    station_price_per_kwh: 20,
    station_is_open: true,
    charge_minutes_to_80: 38,
    jarvis_message:
      "Manual lookup complete. Nearest available charger is Tata Power EZ Charge in Indiranagar, 2.4 km out. Two CCS2 stalls currently free — recommend departing within the next ten minutes.",
  };
}
