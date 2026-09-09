import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  demoChargingLookup,
  postChargingLookup,
  type ChargingStatus,
  type RecentStation,
} from "@/lib/charging-api";
import { useChargingStatus } from "@/hooks/useChargingStatus";
import { AuraNav } from "./AuraNav";
import { AuraLoader } from "./AuraLoader";
import { Badge } from "./Badge";
import { DetailsDisclosure } from "./DetailsDisclosure";
import { JarvisPanel } from "./JarvisPanel";
import { RangeAdjustmentNote } from "./RangeAdjustmentNote";
import { StatCard } from "./StatCard";

/** Average city driving speed used to derive a countdown when the backend
 *  doesn't send eta_seconds — 30 km/h keeps the demo countdown believable. */
const FALLBACK_SPEED_KMH = 30;

function useCountdown(targetSeconds: number | null): number | null {
  const [end, setEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (targetSeconds == null) {
      setEnd(null);
      return;
    }
    setEnd(Date.now() + targetSeconds * 1000);
  }, [targetSeconds]);

  useEffect(() => {
    if (end == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [end]);

  if (end == null) return null;
  return Math.max(0, Math.round((end - now) / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "--";
  const min = Math.max(0, Math.round(diff / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} hr ago`;
}

/** Minimal hero: one distance, one countdown, one name, one Navigate action.
 *  Station detail (power, connectors, price…) is intentionally NOT shown here —
 *  the driver sees it only after tapping into the full navigation view. */
function HeroSuggestion({ status }: { status: ChargingStatus }) {
  const eta =
    status.eta_seconds ??
    (status.station_distance_km != null
      ? Math.round((status.station_distance_km / FALLBACK_SPEED_KMH) * 3600)
      : null);
  const remaining = useCountdown(eta);

  return (
    <motion.section
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="panel-brutal relative overflow-hidden p-6 md:p-8"
      style={{
        borderColor: "var(--hud-ok)",
        boxShadow: "var(--shadow-brutal), var(--glow-hud)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-hud-ok text-[11px] tracking-[0.32em] uppercase">
          ⚡ Charge stop suggested
        </span>
        {status.station_available_stalls != null && (
          <Badge tone={status.station_available_stalls > 0 ? "hud" : "warn"}>
            {status.station_available_stalls > 0
              ? `${status.station_available_stalls} free now`
              : "Busy"}
          </Badge>
        )}
      </div>

      <h2 className="mt-4 text-xl font-semibold tracking-wide md:text-2xl">
        {status.station_name ?? "Nearest station"}
      </h2>
      {status.station_address && (
        <p className="mt-1 text-sm text-muted-foreground">{status.station_address}</p>
      )}

      <div className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <span className="text-glow text-hud text-6xl font-semibold tabular-nums">
          {status.station_distance_km != null ? status.station_distance_km.toFixed(1) : "--"}
          <span className="ml-2 text-lg tracking-widest uppercase">km</span>
        </span>
        <span className="text-hud-warn text-3xl font-semibold tabular-nums">
          {remaining != null ? formatCountdown(remaining) : "--:--"}
          <span className="ml-2 text-[10px] tracking-[0.25em] uppercase">to arrival</span>
        </span>
      </div>

      <Link
        to="/charging/station"
        search={{
          name: status.station_name ?? "Nearest station",
          lat: status.station_lat ?? 0,
          lon: status.station_lon ?? 0,
          dist: status.station_distance_km ?? undefined,
          eta: eta ?? undefined,
          address: status.station_address ?? undefined,
        }}
        className="mt-6 flex w-full items-center justify-center gap-3 border border-foreground bg-foreground px-6 py-5 text-sm font-semibold tracking-[0.3em] text-background uppercase transition-colors hover:border-hud hover:bg-hud"
      >
        Navigate <span aria-hidden>→</span>
      </Link>
    </motion.section>
  );
}

export function ChargingPage() {
  const { status, warming, simulated } = useChargingStatus();
  const [manual, setManual] = useState<ChargingStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const effective = manual ?? status;

  const checkNow = async () => {
    setChecking(true);
    try {
      const res = await postChargingLookup();
      setManual(res);
    } catch {
      // backend unreachable — show the demo lookup so the page stays demoable
      setManual(demoChargingLookup());
    } finally {
      setChecking(false);
    }
  };

  const recent = effective?.recent_stations ?? [];
  const adjusted = effective?.adjusted_range_km ?? null;

  return (
    <div className="relative min-h-screen">
      <div className="hud-grid pointer-events-none fixed inset-0 opacity-60" />

      <main className="relative mx-auto w-full max-w-4xl px-5 py-8 md:px-8 md:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-glow text-hud text-2xl font-semibold tracking-[0.4em] uppercase md:text-3xl">
            Charging
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
          <AuraLoader label="Scanning charging network" variant="hero" />
        ) : (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Adjusted range"
                value={adjusted}
                unit="km"
                decimals={1}
                index={0}
                tone={(adjusted ?? 999) < 25 ? "warn" : "hud"}
              />
              <StatCard
                label="Battery"
                value={effective?.battery_percent ?? null}
                unit="%"
                decimals={0}
                index={1}
                tone={(effective?.battery_percent ?? 100) < 20 ? "warn" : "hud"}
              />
            </div>

            {/* Always explain the adjusted number when we have a baseline to
                compare against — no adjusted range without a reason. */}
            <div className="mt-4">
              <RangeAdjustmentNote
                baselineRangeKm={effective?.baseline_range_km ?? null}
                adjustedRangeKm={adjusted}
                factors={effective?.range_factors ?? null}
              />
            </div>

            <div className="mt-4">
              <AnimatePresence mode="wait">
                {effective?.has_active_suggestion ? (
                  <HeroSuggestion key="hero" status={effective} />
                ) : (
                  <motion.section
                    key="calm"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="panel-brutal flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
                  >
                    <span
                      className="bg-hud-ok h-2 w-2"
                      style={{ animation: "hud-pulse 1.8s ease-in-out infinite" }}
                    />
                    <p className="text-sm tracking-[0.2em] text-foreground uppercase">
                      No charging stop needed
                    </p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      {adjusted != null
                        ? `${adjusted.toFixed(0)} km of usable range left — nearest known charger is ${
                            recent[0]?.distance_km != null
                              ? `${recent[0].distance_km.toFixed(1)} km away`
                              : "in your recent list"
                          }.`
                        : "AURA is watching your range and will suggest a stop before it matters."}
                    </p>
                  </motion.section>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-4">
              <button
                onClick={checkNow}
                disabled={checking}
                className={`w-full border px-4 py-4 text-[11px] tracking-[0.3em] uppercase transition-colors ${
                  checking
                    ? "cursor-wait border-hud-warn text-hud-warn"
                    : "border-border text-muted-foreground hover:border-hud hover:text-hud"
                }`}
              >
                {checking ? "Scanning…" : "⚡ Find a charger now"}
              </button>
            </div>

            <DetailsDisclosure label="Details">
              {effective?.jarvis_message && (
                <div className="mb-4">
                  <JarvisPanel typed={effective.jarvis_message} speaking={false} voice="text-only" />
                </div>
              )}
              {recent.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-[11px] tracking-[0.32em] text-muted-foreground uppercase">
                      Recent stations
                    </h2>
                    <Badge tone="neutral">{recent.length} logged</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {recent.map((s: RecentStation, i: number) => (
                      <motion.div
                        key={`${s.station_name}-${s.timestamp}`}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.35 }}
                      >
                        <Link
                          to="/charging/station"
                          search={{
                            name: s.station_name,
                            lat: s.lat ?? 0,
                            lon: s.lon ?? 0,
                            dist: s.distance_km ?? undefined,
                            eta: undefined,
                            address: undefined,
                          }}
                          className="panel-brutal block px-4 py-3 transition-colors hover:border-hud"
                        >
                          <div className="text-xs font-semibold tracking-wide text-foreground">
                            {s.station_name}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                            <span>
                              <span className="text-hud tabular-nums">
                                {s.distance_km != null ? s.distance_km.toFixed(1) : "--"}
                              </span>{" "}
                              km
                            </span>
                            <span>{relativeTime(s.timestamp)}</span>
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}
            </DetailsDisclosure>
          </>
        )}
      </main>
    </div>
  );
}
