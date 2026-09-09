import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useDiagnostics } from "@/hooks/useDiagnostics";
import type { Diagnostics, SensorTriple, ServiceCall } from "@/lib/diagnostics-api";
import { AuraNav } from "./AuraNav";
import { AuraLoader } from "./AuraLoader";
import { Badge } from "./Badge";

function formatUptime(seconds: number | null): string {
  if (seconds == null) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function relativeShort(iso: string | null, now: number): string {
  if (!iso) return "--";
  const diff = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (Number.isNaN(diff)) return "--";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

function CompactStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="panel-brutal scanline relative overflow-hidden px-4 py-3">
      <span className="text-[9px] tracking-[0.28em] text-muted-foreground uppercase">{label}</span>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-glow text-hud text-2xl font-semibold tabular-nums">{value}</span>
        {unit && (
          <span className="text-[10px] tracking-widest text-muted-foreground uppercase">{unit}</span>
        )}
      </div>
    </div>
  );
}

function SensorCard({
  label,
  unit,
  data,
  index,
}: {
  label: string;
  unit: string;
  data: SensorTriple;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      className="panel-brutal px-4 py-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] tracking-[0.28em] text-muted-foreground uppercase">{label}</span>
        <span className="text-hud-dim text-[9px]">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="mt-2.5 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">Raw</span>
          <span className="text-sm tabular-nums text-foreground/60">
            {data.raw != null ? data.raw.toFixed(1) : "--"}
            <span className="ml-1 text-[9px] text-muted-foreground">{unit}</span>
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <Badge tone="hud">Filtered</Badge>
          <span className="text-glow text-hud text-xl font-semibold tabular-nums">
            {data.filtered != null ? data.filtered.toFixed(1) : "--"}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>
          </span>
        </div>
        <div className="border-border flex items-baseline justify-between border-t pt-2">
          <span className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">Rate</span>
          <span className="text-hud-dim text-[11px] tabular-nums">
            {data.rate != null ? `${data.rate > 0 ? "+" : ""}${data.rate.toFixed(2)} ${unit}/s` : "--"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function statusTone(status: string | undefined): "hud" | "crit" | "neutral" {
  if (status === "success") return "hud";
  if (status === "failed" || status === "error") return "crit";
  return "neutral";
}

function PipelineBadge({
  label,
  ok,
  call,
}: {
  label: string;
  ok?: boolean | null;
  call?: ServiceCall | null;
}) {
  const tone = call
    ? statusTone(call.status)
    : ok == null
      ? "neutral"
      : ok
        ? "hud"
        : "crit";
  const text = call
    ? `${label}: ${call.status.replace(/_/g, " ")}${
        call.duration_ms != null ? ` · ${call.duration_ms}ms` : ""
      }`
    : `${label}: ${ok == null ? "unknown" : ok ? "connected" : "failed"}`;
  return (
    <Badge tone={tone}>
      <span
        className={`h-1.5 w-1.5 ${
          tone === "crit" ? "bg-hud-crit" : tone === "hud" ? "bg-hud" : "bg-foreground/40"
        }`}
      />
      {text}
    </Badge>
  );
}

export function SystemPage() {
  const { data, warming, simulated } = useDiagnostics();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const nominal = Boolean(data?.background_loop_running) && data?.last_cycle_error == null;

  return (
    <div className="relative min-h-screen">
      <div className="hud-grid pointer-events-none fixed inset-0 opacity-60" />

      <main className="relative mx-auto w-full max-w-5xl px-5 py-8 md:px-8 md:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-glow text-hud text-2xl font-semibold tracking-[0.4em] uppercase md:text-3xl">
              System Diagnostics
            </h1>
            <Badge tone="neutral">Engineer view</Badge>
            <Badge tone={nominal ? "hud" : "crit"}>
              <span
                className={`h-1.5 w-1.5 ${nominal ? "bg-hud" : "bg-hud-crit"}`}
                style={{ animation: "hud-pulse 1.6s ease-in-out infinite" }}
              />
              {nominal ? "Nominal" : "Error"}
            </Badge>
          </div>
          <div className="flex flex-col items-end gap-2">
            <AuraNav />
            {simulated && (
              <span className="text-[9px] tracking-[0.3em] text-hud-crit uppercase">
                Simulation feed — backend unreachable
              </span>
            )}
          </div>
        </header>

        {data?.last_cycle_error && (
          <div className="panel-brutal mt-4 border-hud-crit px-4 py-2 text-[11px] tracking-[0.15em] text-hud-crit uppercase">
            Last cycle error: {data.last_cycle_error}
          </div>
        )}

        {warming || !data ? (
          <AuraLoader label="Probing backend diagnostics" variant="list" />

        ) : (
          <>
            {/* Backend health */}
            <section className="mt-6 grid grid-cols-3 gap-3">
              <CompactStat label="Uptime" value={formatUptime(data.uptime_seconds)} />
              <CompactStat
                label="Cycle interval"
                value={data.cycle_interval_seconds != null ? String(data.cycle_interval_seconds) : "--"}
                unit="s"
              />
              <CompactStat label="Last cycle" value={relativeShort(data.last_cycle_at, now)} />
            </section>

            {/* Raw vs filtered */}
            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[11px] tracking-[0.32em] text-muted-foreground uppercase">
                  Signal conditioning — raw vs filtered
                </h2>
                <Badge tone="neutral">Kalman smoothing</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <SensorCard label="Voltage" unit="V" data={data.voltage} index={0} />
                <SensorCard label="Current" unit="A" data={data.current_a} index={1} />
                <SensorCard label="Speed" unit="km/h" data={data.speed_kmh} index={2} />
              </div>
              <p className="mt-2 text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                Noisy sensor input is smoothed before range + alert decisions are made
              </p>
            </section>

            {/* Pipeline status */}
            <section className="mt-8">
              <h2 className="mb-3 text-[11px] tracking-[0.32em] text-muted-foreground uppercase">
                Pipeline status
              </h2>
              <div className="panel-brutal flex flex-wrap gap-2 px-4 py-3">
                <PipelineBadge label="Supabase" ok={data.supabase_connected} />
                <PipelineBadge label="ML model" ok={data.ml_model_loaded} />
                <PipelineBadge label="Gemini" call={data.gemini} />
                <PipelineBadge label="OpenChargeMap" call={data.openchargemap} />
              </div>
            </section>

            {/* External services footer */}
            <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-border pt-4 text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              <span>
                Gemini model: <span className="text-foreground/70">{data.gemini_model ?? "--"}</span>
              </span>
              <span>
                ElevenLabs:{" "}
                <span className={data.elevenlabs_configured ? "text-hud" : "text-hud-crit"}>
                  {data.elevenlabs_configured == null
                    ? "--"
                    : data.elevenlabs_configured
                      ? "configured"
                      : "not configured"}
                </span>
              </span>
              <span>rest /diagnostics · poll 3s</span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
