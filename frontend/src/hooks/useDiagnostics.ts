import { useEffect, useRef, useState } from "react";
import { demoDiagnostics, getDiagnostics, type Diagnostics } from "@/lib/diagnostics-api";

export interface DiagnosticsState {
  data: Diagnostics | null;
  warming: boolean;
  simulated: boolean;
  error: string | null;
}

/** Polls GET /diagnostics every 3s; falls back to a labeled simulation feed. */
export function useDiagnostics(intervalMs = 3000): DiagnosticsState {
  const [state, setState] = useState<DiagnosticsState>({
    data: null,
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
        const data = await getDiagnostics();
        if (cancelled) return;
        setState({ data, warming: false, simulated: false, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({
          data: demoDiagnostics(tick.current),
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
