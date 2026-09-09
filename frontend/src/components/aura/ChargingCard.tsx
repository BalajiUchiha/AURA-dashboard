import { AnimatePresence, motion } from "framer-motion";
import type { ChargingStation } from "@/lib/aura-types";

export function ChargingCard({
  station,
  visible,
}: {
  station: ChargingStation | null | undefined;
  visible: boolean;
}) {
  const show = Boolean(station) && visible;
  const distance = station?.distance_km ?? station?.distance ?? null;

  return (
    <AnimatePresence>
      {show && station ? (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
          className="panel-brutal relative overflow-hidden p-6"
          style={{ borderColor: "var(--hud-ok)" }}
        >
          <div className="text-hud-ok text-[11px] tracking-[0.32em] uppercase">
            Charging node located
          </div>
          <div className="text-glow mt-3 text-2xl font-semibold">{station.name}</div>
          {station.address ? (
            <div className="mt-2 text-sm text-muted-foreground">{station.address}</div>
          ) : null}
          {distance != null ? (
            <div className="border-border mt-5 flex items-baseline gap-2 border-t pt-4">
              <span className="text-hud-ok text-3xl font-semibold tabular-nums">
                {typeof distance === "number" ? distance.toFixed(1) : distance}
              </span>
              <span className="text-xs tracking-widest text-muted-foreground uppercase">
                km away
              </span>
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
