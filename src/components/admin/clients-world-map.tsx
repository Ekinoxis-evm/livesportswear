"use client";

import { useMemo, useState } from "react";
import world from "@/lib/world-geo.json";

export type CountryDatum = { iso: string; name: string; flag: string; clients: number };

type Geometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };
type Feature = { id: string; geometry: Geometry };

// Equirectangular, cropped to a sensible band (drops empty Antarctica/poles) so
// the populated world fills the frame. Equal degrees-per-pixel on both axes.
const W = 1000;
const LAT_MAX = 84;
const LAT_MIN = -60;
const H = Math.round((W * (LAT_MAX - LAT_MIN)) / 360);

function project(lon: number, lat: number): [number, number] {
  return [
    ((lon + 180) / 360) * W,
    ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H,
  ];
}

function pathFor(geometry: Geometry): string {
  const polys =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.coordinates;
  let d = "";
  for (const poly of polys) {
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
      });
      d += "Z";
    }
  }
  return d;
}

/** A world map shading countries by client count, with a hover total. */
export function ClientsWorldMap({ data }: { data: CountryDatum[] }) {
  const byIso = useMemo(() => new Map(data.map((d) => [d.iso, d])), [data]);
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.clients)), [data]);
  const [hover, setHover] = useState<{ iso: string; x: number; y: number } | null>(null);

  const fillFor = (iso: string) => {
    const n = byIso.get(iso)?.clients ?? 0;
    if (n === 0) return "var(--color-muted)";
    const t = Math.min(1, n / max);
    return `color-mix(in srgb, var(--color-primary) ${25 + Math.round(t * 70)}%, transparent)`;
  };

  const active = hover ? byIso.get(hover.iso) : null;

  return (
    <div className="relative w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Clients by country"
        onMouseLeave={() => setHover(null)}
      >
        {(world as { features: Feature[] }).features.map((f) => (
          <path
            key={f.id}
            d={pathFor(f.geometry)}
            fill={fillFor(f.id)}
            stroke="var(--color-background)"
            strokeWidth={0.5}
            className="cursor-default transition-[fill]"
            onMouseEnter={(e) =>
              setHover({
                iso: f.id,
                x: e.nativeEvent.offsetX,
                y: e.nativeEvent.offsetY,
              })
            }
            onMouseMove={(e) =>
              byIso.get(f.id) &&
              setHover({ iso: f.id, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })
            }
          />
        ))}
      </svg>

      {active && hover && (
        <div
          className="bg-popover text-popover-foreground pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          <span className="font-medium">
            {active.flag} {active.name}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {" · "}
            {active.clients.toLocaleString()} client{active.clients === 1 ? "" : "s"}
          </span>
        </div>
      )}
    </div>
  );
}
