import { Link, useSearch } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { StationMap } from "./StationMap";

function formatEta(seconds: number): string {
  const m = Math.max(0, Math.round(seconds / 60));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}

/** Full-screen, single-instruction navigation view — one map, one line, one action. */
export function StationNavPage() {
  const { name, lat, lon, dist, eta, address } = useSearch({ from: "/charging/station" });
  const [left, setLeft] = useState<number | null>(eta ?? null);

  useEffect(() => {
    if (eta == null) return;
    setLeft(eta);
    const id = setInterval(() => setLeft((s) => (s == null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(id);
  }, [eta]);

  const mapsUrl = `https://www.openstreetmap.org/directions?to=${lat}%2C${lon}`;

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="relative flex-1">
        {lat !== 0 || lon !== 0 ? (
          <StationMap
            lat={lat}
            lon={lon}
            label={name}
            stationId={name}
            chrome={false}
            height="h-[62vh] min-h-[320px]"
          />
        ) : (
          <div className="flex h-[62vh] items-center justify-center text-xs tracking-[0.3em] text-muted-foreground uppercase">
            No coordinates for this station
          </div>
        )}

        <Link
          to="/charging"
          className="panel-brutal absolute top-4 left-4 bg-background px-5 py-3 text-xs font-semibold tracking-[0.25em] text-foreground uppercase transition-colors hover:border-hud hover:text-hud"
        >
          ← Back
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="panel-brutal relative z-10 -mt-6 mx-4 mb-6 bg-background px-6 py-6 md:mx-10 md:px-10 md:py-8"
      >
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          {dist != null && (
            <span className="text-glow text-hud text-5xl font-semibold tabular-nums md:text-6xl">
              {dist.toFixed(1)}
              <span className="ml-2 text-lg tracking-widest uppercase">km</span>
            </span>
          )}
          {left != null && (
            <span className="text-hud-warn text-2xl font-semibold tabular-nums md:text-3xl">
              {formatEta(left)}
            </span>
          )}
        </div>

        <h1 className="mt-3 text-xl font-semibold tracking-wide text-foreground md:text-2xl">
          {name}
        </h1>
        {address && <p className="mt-1 text-sm text-muted-foreground">{address}</p>}

        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-block border border-foreground bg-foreground px-8 py-4 text-sm tracking-[0.3em] text-background uppercase transition-colors hover:border-hud hover:bg-hud"
        >
          Start
        </a>
      </motion.div>
    </div>
  );
}
