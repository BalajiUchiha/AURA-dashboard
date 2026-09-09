import { motion } from "framer-motion";
import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartSeries {
  key: string;
  name: string;
  /** "hud" = electric blue, "neutral" = white/grey */
  tone: "hud" | "neutral";
}

interface ChartCardProps {
  title: string;
  caption?: string;
  data: Record<string, unknown>[];
  xKey: string;
  series: ChartSeries[];
  unit?: string;
  height?: number;
  index?: number;
}

const STROKE = { hud: "#00d4ff", neutral: "#e8ecf1" } as const;

function formatX(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "");
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChartCard({
  title,
  caption,
  data,
  xKey,
  series,
  unit = "",
  height = 280,
  index = 0,
}: ChartCardProps) {
  const gid = useId().replace(/[:]/g, "");

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 * index, duration: 0.45 }}
      className="panel-brutal relative overflow-hidden p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase">{title}</h3>
        <div className="flex gap-4">
          {series.map((s) => (
            <span
              key={s.key}
              className="flex items-center gap-1.5 text-[9px] tracking-[0.2em] uppercase"
              style={{ color: STROKE[s.tone] }}
            >
              <span className="inline-block h-px w-4" style={{ background: STROKE[s.tone] }} />
              {s.name}
            </span>
          ))}
        </div>
      </div>

      <div style={{ height }} className="mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <defs>
              {series.map((s) => (
                <linearGradient
                  key={s.key}
                  id={`${gid}-${s.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={STROKE[s.tone]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={STROKE[s.tone]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="rgba(0,212,255,0.07)" strokeDasharray="2 6" vertical={false} />
            <XAxis
              dataKey={xKey}
              tickFormatter={formatX}
              tick={{ fontSize: 9, fill: "#5a6675", fontFamily: "JetBrains Mono" }}
              stroke="rgba(0,212,255,0.15)"
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#5a6675", fontFamily: "JetBrains Mono" }}
              stroke="rgba(0,212,255,0.15)"
              tickLine={false}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                background: "#05070d",
                border: "1px solid rgba(0,212,255,0.35)",
                borderRadius: 0,
                fontFamily: "JetBrains Mono",
                fontSize: 11,
              }}
              labelFormatter={(v) => formatX(v)}
              formatter={(value: unknown, name: unknown) => [
                `${Number(value).toFixed(1)}${unit ? ` ${unit}` : ""}`,
                String(name),
              ]}
            />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={STROKE[s.tone]}
                strokeWidth={s.tone === "hud" ? 2 : 1.5}
                fill={`url(#${gid}-${s.key})`}
                dot={false}
                isAnimationActive
                animationDuration={700}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {caption && (
        <p className="text-hud-dim mt-3 text-[10px] tracking-[0.15em] uppercase">{caption}</p>
      )}
    </motion.section>
  );
}
