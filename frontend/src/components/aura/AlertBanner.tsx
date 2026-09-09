import { AnimatePresence, motion } from "framer-motion";
import type { AuraAlert } from "@/lib/aura-types";

const TONE = {
  info: {
    bar: "bg-hud",
    text: "text-hud",
    wash: "color-mix(in oklab, var(--hud) 12%, transparent)",
  },
  warning: {
    bar: "bg-hud-warn",
    text: "text-hud-warn",
    wash: "color-mix(in oklab, var(--hud-warn) 14%, transparent)",
  },
  critical: {
    bar: "bg-hud-crit",
    text: "text-hud-crit",
    wash: "color-mix(in oklab, var(--hud-crit) 16%, transparent)",
  },
} as const;

function severityOf(alert: AuraAlert): keyof typeof TONE {
  if (alert.severity && alert.severity in TONE) return alert.severity;
  const flag = (alert.alert_flag ?? "").toUpperCase();
  if (/CRIT|DANGER|FAIL|LOW_RANGE/.test(flag)) return "critical";
  if (/WARN|HIGH|TEMP|DRAW/.test(flag)) return "warning";
  return "info";
}

export function AlertBanner({ alert }: { alert: AuraAlert | null | undefined }) {
  const active = alert?.alert_flag ? alert : null;
  const tone = active ? TONE[severityOf(active)] : TONE.info;

  return (
    <AnimatePresence mode="wait">
      {active ? (
        <motion.div
          key={active.alert_flag}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.35 }}
          className="panel-brutal flex items-stretch gap-4 overflow-hidden"
          style={{ backgroundImage: `linear-gradient(90deg, ${tone.wash}, transparent 70%)` }}
        >
          <div className={`w-1.5 ${tone.bar}`} />
          <div className="py-3 pr-5">
            <div className={`text-[11px] tracking-[0.3em] uppercase ${tone.text}`}>
              {active.alert_flag}
            </div>
            <p className="text-foreground/85 mt-1 text-sm">{active.alert_message}</p>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="clear"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="panel-brutal flex items-center gap-3 px-5 py-3"
        >
          <span className="bg-hud-ok h-2 w-2" />
          <span className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
            No active alerts
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
