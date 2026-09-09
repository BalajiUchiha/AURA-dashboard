import { API_BASE } from "./aura-api";

export interface RangePoint {
  timestamp: string;
  baseline_range_km: number;
  adjusted_range_km: number;
  degradation_percent: number;
}

export interface RangeCurrent {
  baseline_range_km: number;
  adjusted_range_km: number;
  degradation_percent: number;
  confidence: "high" | "medium" | "low" | string;
}

export interface RangeAnalysis {
  status?: string;
  session_start?: string;
  current?: RangeCurrent;
  trend?: RangePoint[];
  factor_breakdown?: Record<string, number>;
}

/** GET /range-analysis?limit=30 — session trend + degradation analysis. */
export async function getRangeAnalysis(limit = 30, signal?: AbortSignal): Promise<RangeAnalysis> {
  const res = await fetch(`${API_BASE}/range-analysis?limit=${limit}`, signal ? { signal } : {});
  if (!res.ok) throw new Error(`GET /range-analysis failed: ${res.status}`);
  return (await res.json()) as RangeAnalysis;
}

/** Simulated analysis used only when the backend is unreachable. */
export function demoRangeAnalysis(tick: number): RangeAnalysis {
  const points: RangePoint[] = [];
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const t = now - i * 60_000;
    const drift = (29 - i) * 0.35;
    const jitter = Math.sin(tick / 4 + i) * 1.2;
    const baseline = 320 - i * 0.1;
    points.push({
      timestamp: new Date(t).toISOString(),
      baseline_range_km: +(baseline + jitter).toFixed(1),
      adjusted_range_km: +(baseline - drift - 12 + jitter).toFixed(1),
      degradation_percent: +(4 + drift / 6 + Math.abs(jitter) / 2).toFixed(1),
    });
  }
  const last = points[points.length - 1]!;
  return {
    session_start: new Date(now - 30 * 60_000).toISOString(),
    current: {
      baseline_range_km: last.baseline_range_km,
      adjusted_range_km: last.adjusted_range_km,
      degradation_percent: last.degradation_percent,
      confidence: tick % 20 > 6 ? "high" : "medium",
    },
    trend: points,
    factor_breakdown: {
      "High speed": 9,
      "Aggressive accel": 6,
      "Cold ambient": 4,
      "High load AC": 3,
      "Uphill grade": 2,
    },
  };
}
