import { motion } from "framer-motion";
import { useRangeAnalysis } from "@/hooks/useRangeAnalysis";
import { AuraNav } from "./AuraNav";
import { AuraLoader } from "./AuraLoader";
import { DetailsDisclosure } from "./DetailsDisclosure";
import { Badge } from "./Badge";
import { ChartCard } from "./ChartCard";
import { StatCard } from "./StatCard";

const CONFIDENCE_TONE: Record<string, "hud" | "neutral" | "warn"> = {
  high: "hud",
  medium: "neutral",
  low: "warn",
};

export function RangePage() {
  const { data, warming, simulated } = useRangeAnalysis(30, 5000);

  const current = data?.current;
  const trend = data?.trend ?? [];
  const gapKm =
    current != null ? Math.max(0, current.baseline_range_km - current.adjusted_range_km) : null;
  const gapLarge = gapKm != null && gapKm > 20;
  const factors = Object.entries(data?.factor_breakdown ?? {}).sort((a, b) => b[1] - a[1]);
  const maxFactor = factors[0]?.[1] ?? 1;

  return (
    <div className="relative min-h-screen">
      <div className="hud-grid pointer-events-none fixed inset-0 opacity-60" />

      <main className="relative mx-auto w-full max-w-6xl px-5 py-8 md:px-8 md:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-4">
            <h1 className="text-glow text-hud text-2xl font-semibold tracking-[0.35em] uppercase md:text-3xl">
              Range & Prediction
            </h1>
            {data?.session_start && (
              <span className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
                Session start {new Date(data.session_start).toLocaleTimeString()}
              </span>
            )}
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

        {warming ? (
          <AuraLoader label="Warming up range analysis" variant="stats" />
        ) : (
          <>
            <section className="mt-8">
              <div className="panel-brutal scanline relative overflow-hidden px-6 py-8">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] tracking-[0.28em] text-muted-foreground uppercase">
                    Adjusted range
                  </span>
                  {current?.confidence && (
                    <Badge tone={CONFIDENCE_TONE[current.confidence] ?? "neutral"}>
                      {current.confidence} confidence
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-3">
                  <span
                    className={`text-glow text-6xl font-semibold tabular-nums md:text-7xl ${
                      gapLarge ? "text-hud-warn" : "text-hud"
                    }`}
                  >
                    {current?.adjusted_range_km != null
                      ? current.adjusted_range_km.toFixed(0)
                      : "--"}
                  </span>
                  <span className="text-sm tracking-widest text-muted-foreground uppercase">km</span>
                </div>
                {gapKm != null && (
                  <p
                    className={`mt-4 text-sm tracking-[0.15em] uppercase ${
                      gapLarge ? "text-hud-warn" : "text-muted-foreground"
                    }`}
                  >
                    ▼ {gapKm.toFixed(1)} km below baseline
                  </p>
                )}
              </div>
            </section>

            <DetailsDisclosure label="Details">
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard
                  label="Baseline range"
                  value={current?.baseline_range_km}
                  unit="km"
                  decimals={1}
                  index={0}
                />
                <StatCard
                  label="Degradation"
                  value={current?.degradation_percent}
                  unit="%"
                  decimals={1}
                  index={1}
                  tone={(current?.degradation_percent ?? 0) > 10 ? "warn" : "hud"}
                />
              </div>

              {trend.length >= 5 ? (
                <>
                  <div className="mt-4">
                    <ChartCard
                      title="Baseline vs adjusted range — session trend"
                      data={trend as unknown as Record<string, unknown>[]}
                      xKey="timestamp"
                      unit="km"
                      height={300}
                      index={3}
                      series={[
                        { key: "baseline_range_km", name: "Baseline", tone: "neutral" },
                        { key: "adjusted_range_km", name: "Adjusted", tone: "hud" },
                      ]}
                      caption="Widening gap between the two traces = degradation increasing this session"
                    />
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                    <ChartCard
                      title="Degradation % over time"
                      data={trend as unknown as Record<string, unknown>[]}
                      xKey="timestamp"
                      unit="%"
                      height={220}
                      index={4}
                      series={[{ key: "degradation_percent", name: "Degradation", tone: "hud" }]}
                    />
                    <motion.section
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.45 }}
                      className="panel-brutal p-5"
                    >
                      <h3 className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
                        What's driving degradation
                      </h3>
                      <div className="mt-4 space-y-3">
                        {factors.map(([name, count]) => (
                          <div key={name}>
                            <div className="flex items-center justify-between text-[10px] tracking-[0.15em] uppercase">
                              <span className="text-foreground">{name}</span>
                              <span className="text-hud tabular-nums">{count}</span>
                            </div>
                            <div className="bg-secondary mt-1 h-1.5 w-full">
                              <motion.div
                                className="bg-hud h-1.5"
                                initial={{ width: 0 }}
                                animate={{ width: `${(count / maxFactor) * 100}%` }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                              />
                            </div>
                          </div>
                        ))}
                        {factors.length === 0 && (
                          <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                            No dominant factors yet
                          </p>
                        )}
                      </div>
                    </motion.section>
                  </div>
                </>
              ) : (
                <div className="panel-brutal mt-4 flex h-48 items-center justify-center">
                  <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
                    Gathering data — trends will appear as more readings come in
                  </p>
                </div>
              )}
            </DetailsDisclosure>
          </>
        )}

      </main>
    </div>
  );
}
