import { useEffect, useRef } from "react";
import gsap from "gsap";

const LINES = [
  "> INITIALIZING AURA CORE ............ OK",
  "> BATTERY MANAGEMENT LINK .......... OK",
  "> ASSISTANT VOICE MODULE ........... OK",
];

export function BootSequence({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: onDone });
      tl.from(".boot-title", { opacity: 0, letterSpacing: "1.2em", duration: 0.6 })
        .from(".boot-rule", { scaleX: 0, transformOrigin: "left", duration: 0.4 }, "-=0.25")
        .from(".boot-line", { opacity: 0, x: -18, stagger: 0.13, duration: 0.28 }, "-=0.15")
        .to(".boot-shell", { opacity: 0, duration: 0.4, delay: 0.35 });
    }, root);
    return () => ctx.revert();
  }, [onDone]);

  return (
    <div ref={root} className="fixed inset-0 z-50">
      <div className="boot-shell bg-background hud-grid flex h-full w-full flex-col items-center justify-center">
        <div className="boot-title text-glow text-hud text-4xl font-semibold tracking-[0.5em] md:text-6xl">
          AURA
        </div>
        <div className="bg-hud boot-rule mt-4 h-px w-64 md:w-96" />
        <div className="mt-8 space-y-1 text-xs text-muted-foreground md:text-sm">
          {LINES.map((l) => (
            <div key={l} className="boot-line">
              {l}
            </div>
          ))}
        </div>
        <div className="boot-line text-hud mt-6 text-[11px] tracking-[0.4em] uppercase">
          Dashboard online
        </div>
      </div>
    </div>
  );
}
