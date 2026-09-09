import { motion } from "framer-motion";

interface JarvisPanelProps {
  typed: string;
  speaking: boolean;
  voice: "idle" | "audio" | "text-only";
}

export function JarvisPanel({ typed, speaking, voice }: JarvisPanelProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="panel-brutal scanline relative overflow-hidden p-6 md:p-8"
      style={
        speaking
          ? { boxShadow: "var(--shadow-brutal), var(--glow-hud)", borderColor: "var(--hud)" }
          : {}
      }
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.span
            className="bg-hud block h-2 w-2"
            animate={speaking ? { scale: [1, 1.9, 1], opacity: [1, 0.4, 1] } : { scale: 1 }}
            transition={{ repeat: speaking ? Infinity : 0, duration: 1.1 }}
          />
          <span className="text-hud text-[11px] tracking-[0.35em] uppercase">Aura // Assistant</span>
        </div>
        <span className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
          {speaking ? (voice === "audio" ? "Speaking" : "Transcribing") : "Standby"}
        </span>
      </div>

      <p className="text-foreground/95 mt-6 min-h-24 text-lg leading-relaxed md:text-2xl">
        {typed}
        <motion.span
          className="bg-hud ml-1 inline-block h-5 w-2 align-middle md:h-7"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ repeat: Infinity, duration: 0.9 }}
        />
      </p>

      <div className="mt-6 flex gap-1">
        {Array.from({ length: 40 }).map((_, i) => (
          <motion.span
            key={i}
            className="bg-hud-dim w-full"
            animate={{ height: speaking ? [4, 4 + ((i * 7) % 22), 4] : 3 }}
            transition={{
              repeat: speaking ? Infinity : 0,
              duration: 0.8 + (i % 5) * 0.12,
              ease: "easeInOut",
            }}
            style={{ height: 3 }}
          />
        ))}
      </div>
    </motion.section>
  );
}
