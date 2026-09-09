import { motion } from "framer-motion";

interface AuraLoaderProps {
  /** Single status word/phrase shown once, quietly. */
  label?: string;
  /** Skeleton shape of the page underneath, so nothing jumps on arrival. */
  variant?: "stats" | "hero" | "list";
}

function Block({ className = "" }: { className?: string }) {
  return (
    <div className={`panel-brutal relative overflow-hidden ${className}`}>
      <div
        className="absolute inset-y-0 -left-1/3 w-1/3 bg-hud/10"
        style={{ animation: "hud-sweep 1.6s linear infinite" }}
      />
    </div>
  );
}

/** Shared, low-noise loading state: skeletons in the real layout + one sweep. */
export function AuraLoader({ label = "Loading", variant = "stats" }: AuraLoaderProps) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
      {variant === "stats" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Block className="h-28" />
          <Block className="h-28" />
          <Block className="h-28" />
        </div>
      )}
      {variant === "hero" && (
        <div className="space-y-4">
          <Block className="h-28" />
          <Block className="h-56" />
        </div>
      )}
      {variant === "list" && (
        <div className="space-y-3">
          <Block className="h-24" />
          <Block className="h-24" />
          <Block className="h-24" />
        </div>
      )}
      <p className="mt-4 text-center text-[10px] tracking-[0.35em] text-muted-foreground uppercase">
        {label}
      </p>
    </motion.div>
  );
}
