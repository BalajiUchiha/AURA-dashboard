import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

interface StatCardProps {
  label: string;
  value: number | null | undefined;
  unit: string;
  decimals?: number;
  index?: number;
  tone?: "hud" | "warn" | "crit";
}

export function StatCard({
  label,
  value,
  unit,
  decimals = 0,
  index = 0,
  tone = "hud",
}: StatCardProps) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => v.toFixed(decimals));

  useEffect(() => {
    const controls = animate(mv, value ?? 0, { duration: 0.7, ease: "easeOut" });
    return () => controls.stop();
  }, [value, mv]);

  const toneClass =
    tone === "crit" ? "text-hud-crit" : tone === "warn" ? "text-hud-warn" : "text-hud";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.4 }}
      className="panel-brutal scanline relative overflow-hidden px-5 py-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.28em] text-muted-foreground uppercase">
          {label}
        </span>
        <span className="text-hud-dim text-[10px]">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <motion.span className={`text-glow text-4xl font-semibold tabular-nums ${toneClass}`}>
          {text}
        </motion.span>
        <span className="text-xs tracking-widest text-muted-foreground uppercase">{unit}</span>
      </div>
      <div className="bg-border mt-4 h-px w-full overflow-hidden">
        <div
          className="bg-hud h-px w-1/3"
          style={{ animation: "hud-sweep 3.2s linear infinite" }}
        />
      </div>
    </motion.div>
  );
}
