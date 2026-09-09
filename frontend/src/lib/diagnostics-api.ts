import { API_BASE } from "./aura-api";

export interface SensorTriple {
  raw: number | null;
  filtered: number | null;
  rate: number | null;
}

export interface ServiceCall {
  status: "success" | "failed" | "not_triggered" | string;
  duration_ms?: number | null;
}

export interface Diagnostics {
  background_loop_running: boolean;
  last_cycle_error: string | null;
  uptime_seconds: number | null;
  cycle_interval_seconds: number | null;
  last_cycle_at: string | null;
  voltage: SensorTriple;
  current_a: SensorTriple;
  speed_kmh: SensorTriple;
  supabase_connected: boolean | null;
  ml_model_loaded: boolean | null;
  gemini: ServiceCall | null;
  openchargemap: ServiceCall | null;
  gemini_model: string | null;
  elevenlabs_configured: boolean | null;
}

/** GET /diagnostics */
export async function getDiagnostics(signal?: AbortSignal): Promise<Diagnostics> {
  const res = await fetch(`${API_BASE}/diagnostics`, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`GET /diagnostics failed: ${res.status}`);
  return (await res.json()) as Diagnostics;
}

function jitter(base: number, spread: number): number {
  return base + (Math.random() - 0.5) * spread;
}

/** Demo diagnostics; every 8th tick simulates a failed Gemini call. */
export function demoDiagnostics(tick: number): Diagnostics {
  const geminiOk = tick % 8 !== 7;
  return {
    background_loop_running: true,
    last_cycle_error: null,
    uptime_seconds: 3600 * 3 + 60 * 42 + tick * 3,
    cycle_interval_seconds: 2,
    last_cycle_at: new Date(Date.now() - 1400).toISOString(),
    voltage: { raw: jitter(352.4, 3.2), filtered: 352.1, rate: -0.03 },
    current_a: { raw: jitter(48.6, 6.5), filtered: 47.9, rate: 0.12 },
    speed_kmh: { raw: jitter(42, 5), filtered: 41.7, rate: 0.4 },
    supabase_connected: true,
    ml_model_loaded: true,
    gemini: { status: geminiOk ? "success" : "failed", duration_ms: geminiOk ? 412 : 89 },
    openchargemap: { status: tick > 2 ? "success" : "not_triggered", duration_ms: 233 },
    gemini_model: "gemini-2.5-flash",
    elevenlabs_configured: true,
  };
}
