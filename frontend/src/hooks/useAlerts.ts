import { useEffect, useRef, useState } from "react";
import { demoAlerts, getAlerts, type AlertEntry } from "@/lib/alerts-api";

export interface AlertsFeedState {
  alerts: AlertEntry[];
  warming: boolean;
  simulated: boolean;
  error: string | null;
}

function key(a: AlertEntry): string {
  return `${a.timestamp}|${a.alert_flag}|${a.alert_message}`;
}

/**
 * Polls GET /alerts every 6s. Merges by entry key so React keeps existing
 * DOM nodes — scroll position is preserved and only genuinely new alerts
 * animate in at the top.
 */
export function useAlerts(severity?: string, limit = 30, intervalMs = 6000): AlertsFeedState {
  const [state, setState] = useState<AlertsFeedState>({
    alerts: [],
    warming: true,
    simulated: false,
    error: null,
  });
  const tick = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, warming: true }));

    const poll = async () => {
      tick.current += 1;
      try {
        const res = await getAlerts(limit, severity);
        if (cancelled) return;
        const incoming = res.alerts ?? [];
        setState((prev) => {
          const seen = new Set(incoming.map(key));
          // merge by key so existing DOM nodes persist (scroll stays put)
          const merged = [...incoming];
          for (const old of prev.alerts) {
            if (!seen.has(key(old)) && merged.length < limit) merged.push(old);
          }
          return {
            alerts: merged.slice(0, limit),
            warming: false,
            simulated: false,
            error: null,
          };
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          alerts: demoAlerts(tick.current, severity).alerts ?? [],
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
  }, [severity, limit, intervalMs]);

  return state;
}
