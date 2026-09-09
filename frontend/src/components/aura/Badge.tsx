import type { ReactNode } from "react";

type BadgeTone = "hud" | "neutral" | "warn" | "crit";

const TONE_CLASS: Record<BadgeTone, string> = {
  hud: "border-hud text-hud",
  neutral: "border-foreground/40 text-foreground",
  warn: "border-hud-warn text-hud-warn",
  crit: "border-hud-crit text-hud-crit",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[9px] tracking-[0.25em] uppercase ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
