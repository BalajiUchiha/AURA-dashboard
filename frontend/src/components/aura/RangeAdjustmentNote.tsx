import { motion } from "framer-motion";

interface RangeAdjustmentNoteProps {
  /** Nominal (unadjusted) range for the current charge. */
  baselineRangeKm?: number | null;
  /** Current predicted usable range. */
  adjustedRangeKm?: number | null;
  /** km lost from nominal, keyed by cause. */
  factors?: Record<string, number> | null;
}

/**
 * Explains WHY the adjusted range differs from nominal — the km lost plus the
 * top couple of causes. Designed for a driver glance: one delta line, at most
 * two reasons. Renders nothing when there is no baseline to compare against.
 */
export function RangeAdjustmentNote({
  baselineRangeKm,
  adjustedRangeKm,
  factors,
}: RangeAdjustmentNoteProps) {
  const hasBaseline =
    baselineRangeKm != null && adjustedRangeKm != null && baselineRangeKm > adjustedRangeKm;
  if (!hasBaseline) return null;

  const delta = +(baselineRangeKm! - adjustedRangeKm!).toFixed(1);

  const top = Object.entries(factors ?? {})
    .filter(([, v]) => typeof v === "number" && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="panel-brutal flex flex-col gap-2 px-4 py-3"
      style={{ borderColor: "var(--hud-warn)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[9px] tracking-[0.22em] text-muted-foreground uppercase">
          Why this range
        </span>
        <span className="text-hud-warn text-sm font-semibold tabular-nums">
          −{delta}
          <span className="ml-1 text-[9px] tracking-[0.2em] uppercase">km vs nominal</span>
        </span>
      </div>
      {top.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {top.map(([label, km]) => (
            <span
              key={label}
              className="text-[11px] tracking-wide text-foreground"
            >
              <span className="text-hud-warn tabular-nums">−{Math.round(km)}</span>
              <span className="ml-1 text-muted-foreground">{label}</span>
            </span>
          ))}
        </div>
      ) : (
        <span className="text-[11px] tracking-wide text-muted-foreground">
          Adjusted for current driving conditions.
        </span>
      )}
    </motion.div>
  );
}
