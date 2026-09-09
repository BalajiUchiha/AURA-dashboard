import { useState } from "react";

import { Link } from "@tanstack/react-router";
import { useAuraFeed } from "@/hooks/useAuraFeed";
import { useJarvisSpeech } from "@/hooks/useJarvisSpeech";
import { BootSequence } from "./BootSequence";
import { StatCard } from "./StatCard";
import { AlertBanner } from "./AlertBanner";
import { JarvisPanel } from "./JarvisPanel";
import { ChargingCard } from "./ChargingCard";
import { AuraLoader } from "./AuraLoader";
import { DetailsDisclosure } from "./DetailsDisclosure";
import { AuraNav } from "./AuraNav";


const LINK_LABEL: Record<string, { text: string; dot: string }> = {
  booting: { text: "Connecting", dot: "bg-hud-warn" },
  live: { text: "Live socket", dot: "bg-hud-ok" },
  polling: { text: "Polling /latest", dot: "bg-hud" },
  reconnecting: { text: "Reconnecting", dot: "bg-hud-warn" },
  simulated: { text: "Simulation feed", dot: "bg-hud-crit" },
};

export function Dashboard() {
  const [booted, setBooted] = useState(false);
  const { frame, link, warming } = useAuraFeed();
  const { typed, speaking, complete, voice } = useJarvisSpeech(frame?.jarvis_message ?? null);
  const status = LINK_LABEL[link] ?? LINK_LABEL["booting"]!;

  const runtimeMinutes = frame?.estimated_runtime_seconds 
    ? Math.round(frame.estimated_runtime_seconds / 60)
    : null;

  return (
    <div className="relative min-h-screen">
      {!booted && <BootSequence onDone={() => setBooted(true)} />}
      <div className="hud-grid pointer-events-none fixed inset-0 opacity-60" />

      <main className="relative mx-auto w-full max-w-6xl px-5 py-8 md:px-8 md:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-4">
            <h1 className="text-glow text-hud text-3xl font-semibold tracking-[0.45em] md:text-4xl">
              AURA
            </h1>
            <span className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
              EV Command Deck
            </span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <AuraNav />
            <div className="panel-brutal flex items-center gap-3 px-4 py-2">
              <span
                className={`h-2 w-2 ${status.dot}`}
                style={{ animation: "hud-pulse 1.8s ease-in-out infinite" }}
              />
              <span className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
                {status.text}
              </span>
            </div>
          </div>
        </header>

        {warming ? (
          <AuraLoader label="Warming up telemetry" variant="stats" />
        ) : (
          <>
            <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Speed" value={frame?.speed} unit="km/h" index={0} />
              <StatCard
                label="Adj Range"
                value={frame?.adjusted_range_km ?? frame?.range_km}
                unit="km"
                decimals={2}
                index={1}
                tone={
                  (frame?.adjusted_range_km ?? 0) < 0.3
                    ? "crit"
                    : (frame?.adjusted_range_km ?? 0) < 0.8
                      ? "warn"
                      : "hud"
                }
              />
              <StatCard
                label="Capacity"
                value={frame?.capacity_remaining_percent ?? frame?.battery_pct}
                unit="%"
                index={2}
                tone={
                  ((frame?.capacity_remaining_percent ?? frame?.battery_pct ?? 100) < 20)
                    ? "crit"
                    : ((frame?.capacity_remaining_percent ?? frame?.battery_pct ?? 100) < 40)
                      ? "warn"
                      : "hud"
                }
              />
              <StatCard
                label="Est Runtime"
                value={runtimeMinutes}
                unit="min"
                index={3}
                tone={
                  (runtimeMinutes ?? 99) < 3
                    ? "crit"
                    : (runtimeMinutes ?? 99) < 8
                      ? "warn"
                      : "hud"
                }
              />
            </section>

            <div className="mt-4">
              <AlertBanner alert={frame?.alert} />
            </div>

            <div className="mt-4">
              <JarvisPanel typed={typed} speaking={speaking} voice={voice} />
            </div>

            <div className="mt-4">
              <ChargingCard station={frame?.charging_station} visible={complete} />
            </div>

            <DetailsDisclosure label="Details">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <StatCard label="Voltage" value={frame?.voltage} unit="V" decimals={2} index={0} />
                <StatCard
                  label="Baseline range"
                  value={frame?.baseline_range_km ?? frame?.range_km}
                  unit="km"
                  decimals={2}
                  index={1}
                />
                <StatCard
                  label="Degradation"
                  value={frame?.degradation_percent}
                  unit="%"
                  decimals={1}
                  index={2}
                />
              </div>
              <div className="mt-4 flex gap-3">
                <Link
                  to="/system"
                  className="inline-block border border-border px-4 py-2 text-[10px] tracking-[0.25em] text-muted-foreground uppercase transition-colors hover:border-hud hover:text-hud"
                >
                  System diagnostics (engineer view)
                </Link>
              </div>
            </DetailsDisclosure>
          </>
        )}

        <footer className="mt-10 flex flex-wrap justify-between gap-3 text-[10px] tracking-[0.28em] text-muted-foreground uppercase">
          <span>Voice channel: {voice === "audio" ? "ElevenLabs /tts" : "SpeechSynthesis / Text"}</span>
          <span>ws /ws/live · rest /latest · post /tts</span>
        </footer>
      </main>
    </div>
  );
}
