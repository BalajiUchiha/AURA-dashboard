import { memo, useMemo } from "react";
import { Badge } from "./Badge";

interface StationMapProps {
  lat: number;
  lon: number;
  label: string;
  height?: string;
  /** Stable identity for the station — the map only reloads when this changes. */
  stationId?: string;
  chrome?: boolean;
}

/** Round hard so tiny coordinate drift between polls never reloads the iframe. */
function q(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function StationMapInner({
  lat,
  lon,
  label,
  height = "h-64 md:h-80",
  chrome = true,
}: StationMapProps) {
  const src = useMemo(() => {
    const d = 0.02;
    const la = q(lat);
    const lo = q(lon);
    const bbox = `${q(lo - d)}%2C${q(la - d)}%2C${q(lo + d)}%2C${q(la + d)}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${la}%2C${lo}`;
  }, [lat, lon]);

  const frame = (
    <iframe
      title={`Map of ${label}`}
      src={src}
      className={`w-full ${height}`}
      style={{ border: 0, filter: "grayscale(0.4) contrast(1.1)" }}
      loading="lazy"
    />
  );

  if (!chrome) return frame;

  return (
    <div className="panel-brutal relative overflow-hidden">
      <div className="border-border flex items-center justify-between border-b px-4 py-2">
        <span className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
          Live map — {label}
        </span>
        <Badge tone="hud">OSM</Badge>
      </div>
      {frame}
    </div>
  );
}

/** Memoized on station identity, not on jittering coordinates. */
export const StationMap = memo(StationMapInner, (a, b) => {
  const idA = a.stationId ?? a.label;
  const idB = b.stationId ?? b.label;
  return idA === idB && a.height === b.height && a.chrome === b.chrome;
});
