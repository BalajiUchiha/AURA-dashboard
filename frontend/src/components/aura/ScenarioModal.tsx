import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "./Badge";
import type { AuraTelemetry } from "@/lib/aura-types";

export interface SimulatedEventScenario {
  id: number;
  title: string;
  subtitle: string;
  briefing: string;
  auraWorkflow: string;
  telemetry: AuraTelemetry;
}

interface ScenarioModalProps {
  isOpen: boolean;
  event: SimulatedEventScenario;
  totalEvents: number;
  onClose: () => void;
}

export function ScenarioModal({ isOpen, event, totalEvents, onClose }: ScenarioModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-background/85 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Sleek Briefing Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="panel-brutal scanline relative z-10 w-full max-w-xl overflow-hidden bg-background p-6 shadow-2xl md:p-8"
        >
          {/* Top Control Bar */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <Badge tone="warn">
                SCENARIO EVENT {event.id} OF {totalEvents}
              </Badge>
              <Badge tone="hud">BRIEFING</Badge>
            </div>
            <button
              onClick={onClose}
              className="group flex h-8 w-8 items-center justify-center border border-border text-xs tracking-widest text-muted-foreground uppercase transition-colors hover:border-hud-crit hover:text-hud-crit"
              title="Close Briefing and Start Dashboard Run"
            >
              ✕
            </button>
          </div>

          {/* Scenario Header */}
          <div className="mt-5">
            <h2 className="text-glow text-hud text-xl font-semibold tracking-wider md:text-2xl">
              {event.title}
            </h2>
            <p className="mt-1 text-xs tracking-widest text-muted-foreground uppercase">
              {event.subtitle}
            </p>
          </div>

          {/* Scenario Briefing & AURA Engine Explanation */}
          <div className="mt-6 space-y-4 rounded-none border border-border/80 bg-background/60 p-4">
            <div>
              <span className="text-[10px] tracking-[0.3em] text-hud uppercase font-semibold">
                Scenario Briefing:
              </span>
              <p className="mt-1.5 text-xs leading-relaxed text-foreground/90">
                {event.briefing}
              </p>
            </div>
            <div className="border-t border-border/60 pt-3">
              <span className="text-[10px] tracking-[0.3em] text-hud-warn uppercase font-semibold">
                AURA Engine Response:
              </span>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {event.auraWorkflow}
              </p>
            </div>
          </div>

          {/* Modal Action Footer */}
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <span className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
              Close briefing to activate dashboard run
            </span>
            <button
              onClick={onClose}
              className="border border-hud bg-hud/10 px-5 py-2.5 text-xs tracking-[0.3em] text-hud uppercase font-medium transition-all hover:bg-hud hover:text-background"
            >
              START EVENT {event.id} RUN ➔
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
