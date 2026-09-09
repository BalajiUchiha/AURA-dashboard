import { useEffect, useRef, useState } from "react";
import {
  demoChargingStatus,
  getChargingStatus,
  type ChargingStatus,
} from "@/lib/charging-api";

export interface ChargingFeedState {
  status: ChargingStatus | null;
  warming: boolean;
  simulated: boolean;
  error: string | null;
}

/** Polls GET /charging-status every 6s; falls back to a labeled simulation feed. */
export function useChargingStatus(intervalMs = 6000): ChargingFeedState {
  const [state, setState] = useState<ChargingFeedState>({
    status: null,
    warming: true,
    simulated: false,
    error: null,
  });
  const tick = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      tick.current += 1;
      try {
        const status = await getChargingStatus();
        if (cancelled) return;
        setState({ status, warming: false, simulated: false, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: demoChargingStatus(tick.current),
          warming: false,
          simulated: true,
          error: e instanceof Error ? e.message : "fetch failed",
        });
      }
    };
    void poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return state;
}
