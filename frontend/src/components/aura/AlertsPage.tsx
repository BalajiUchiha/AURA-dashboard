import { motion } from "framer-motion";
import { useState } from "react";
import { useAlerts } from "@/hooks/useAlerts";
import type { AlertEntry } from "@/lib/alerts-api";
import { AuraNav } from "./AuraNav";
import { AuraLoader } from "./AuraLoader";
import { DetailsDisclosure } from "./DetailsDisclosure";
import { Badge } from "./Badge";

const FILTERS = [
  { id: undefined, label: "ALL" },
  { id: "critical", label: "CRITICAL" },
  { id: "warning", label: "WARNING" },
] as const;

const SEVERITY_BAR: Record<string, string> = {
  critical: "bg-hud-crit",
  warning: "bg-hud-warn",
  info: "bg-hud",
};

const SEVERITY_TONE: Record<string, "crit" | "warn" | "hud"> = {
  critical: "crit",
  warning: "warn",
  info: "hud",
};

function entryKey(a: AlertEntry): string {
  return `${a.timestamp}|${a.alert_flag}|${a.alert_message}`;
}

function AlertCard({ entry, index }: { entry: AlertEntry; index: number }) {
  const [open, setOpen] = useState(false);
  const flag = entry.alert_flag ?? "info";
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 4) * 0.04, duration: 0.35 }}
      onClick={() => setOpen((o) => !o)}
      className="panel-brutal relative cursor-pointer overflow-hidden py-4 pr-5 pl-6"
    >
      <span
        className={`absolute top-0 left-0 h-full w-1 ${SEVERITY_BAR[flag] ?? "bg-hud"}`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
          {new Date(entry.timestamp).toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          {entry.had_charging_suggestion && <Badge tone="hud">⚡ Charging suggested</Badge>}
          <Badge tone={SEVERITY_TONE[flag] ?? "hud"}>{flag}</Badge>
        </div>
      </div>

      <p className="text-glow mt-3 text-sm leading-relaxed text-foreground md:text-base">
        {entry.jarvis_message}
      </p>
      <p className="text-hud-dim mt-2 text-[11px] tracking-[0.1em] uppercase">
        {entry.alert_message}
      </p>

      <motion.div layout className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[10px] tracking-[0.15em] uppercase">
        <span className="text-muted-foreground">
          DEGRADATION{" "}
          <span className="text-hud tabular-nums">
            {entry.degradation_percent != null ? `${entry.degradation_percent.toFixed(1)}%` : "--"}
          </span>
        </span>
        <span className="text-muted-foreground">
          VOLTAGE{" "}
          <span className="text-hud tabular-nums">
            {entry.voltage != null ? `${entry.voltage.toFixed(1)}V` : "--"}
          </span>
        </span>
        <span className="text-muted-foreground">
          CURRENT{" "}
          <span className="text-hud tabular-nums">
            {entry.current_a != null ? `${entry.current_a.toFixed(1)}A` : "--"}
          </span>
        </span>
      </motion.div>

      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="border-border mt-3 border-t pt-3 text-[10px] tracking-[0.2em] text-muted-foreground uppercase"
        >
          Entry id {entryKey(entry).slice(0, 32)} · severity {flag} · source /alerts
        </motion.div>
      )}
    </motion.article>
  );
}

export function AlertsPage() {
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const { alerts, warming, simulated } = useAlerts(filter);

  const latest = alerts[0];
  const rest = alerts.slice(1);

  return (
    <div className="relative min-h-screen">
      <div className="hud-grid pointer-events-none fixed inset-0 opacity-60" />

      <main className="relative mx-auto w-full max-w-4xl px-5 py-8 md:px-8 md:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-glow text-hud text-2xl font-semibold tracking-[0.4em] uppercase md:text-3xl">
            Alerts
          </h1>
          <div className="flex flex-col items-end gap-2">
            <AuraNav />
            {simulated && (
              <span className="text-[9px] tracking-[0.3em] text-hud-crit uppercase">
                Simulation feed
              </span>
            )}
          </div>
        </header>

        {warming ? (
          <AuraLoader label="Loading co-pilot log" variant="list" />
        ) : alerts.length === 0 ? (
          <div className="panel-brutal mt-8 flex h-48 flex-col items-center justify-center gap-3">
            <span
              className="bg-hud-ok h-2 w-2"
              style={{ animation: "hud-pulse 1.8s ease-in-out infinite" }}
            />
            <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
              No alerts — everything's nominal
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8">{latest && <AlertCard entry={latest} index={0} />}</div>

            <DetailsDisclosure label={`History (${rest.length})`}>
              <div className="mb-4 flex gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.label}
                    onClick={() => setFilter(f.id)}
                    className={`border px-3 py-1.5 text-[10px] tracking-[0.25em] uppercase transition-colors ${
                      filter === f.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-hud hover:text-hud"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {rest.map((a, i) => (
                  <AlertCard key={entryKey(a)} entry={a} index={i} />
                ))}
                {rest.length === 0 && (
                  <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                    Nothing else logged
                  </p>
                )}
              </div>
            </DetailsDisclosure>
          </>
        )}
      </main>
    </div>
  );
}

