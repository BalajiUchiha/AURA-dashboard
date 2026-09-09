import { useEffect, useRef, useState } from "react";
import { demoRangeAnalysis, getRangeAnalysis, type RangeAnalysis } from "@/lib/range-api";

export interface RangeFeedState {
  data: RangeAnalysis | null;
  warming: boolean;
  simulated: boolean;
  error: string | null;
}

/**
 * Polls GET /range-analysis every 5s. If the backend is unreachable,
 * falls back to a simulated analysis so the UI stays demonstrable.
 */
export function useRangeAnalysis(limit = 30, intervalMs = 5000): RangeFeedState {
  const [state, setState] = useState<RangeFeedState>({
    data: null,
    warming: true,
    simulated: false,
    error: null,
  });
  const tick = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let failures = 0;

    const poll = async () => {
      tick.current += 1;
      try {
        const data = await getRangeAnalysis(limit);
        if (cancelled) return;
        failures = 0;
        const warming = data.status === "warming_up" || !data.trend;
        setState({ data, warming, simulated: false, error: null });
      } catch (e) {
        if (cancelled) return;
        failures += 1;
        if (failures >= 1) {
          setState({
            data: demoRangeAnalysis(tick.current),
            warming: false,
            simulated: true,
            error: e instanceof Error ? e.message : "fetch failed",
          });
        }
      }
    };

    void poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [limit, intervalMs]);

  return state;
}
