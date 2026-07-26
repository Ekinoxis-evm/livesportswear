"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ClientsWorldMap, type CountryDatum } from "./clients-world-map";

export type CountryViewRow = {
  iso: string | null;
  name: string;
  flag: string;
  clients: number;
};

/** The clients-by-country card: toggle between the flag list and a world map. */
export function CountryViews({ rows }: { rows: CountryViewRow[] }) {
  const [view, setView] = useState<"flags" | "map">("flags");
  const mapData: CountryDatum[] = rows
    .filter((r) => r.iso)
    .map((r) => ({ iso: r.iso as string, name: r.name, flag: r.flag, clients: r.clients }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 self-start">
        {(
          [
            ["flags", "Flags"],
            ["map", "Map"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              view === v
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "flags" ? (
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <span
              key={row.iso ?? "unknown"}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                !row.iso && "border-amber-500/40 text-amber-600 dark:text-amber-500",
              )}
            >
              {row.iso ? (
                <>
                  <span aria-hidden>{row.flag}</span>
                  {row.name}
                </>
              ) : (
                "No country indicator"
              )}
              <span className="font-semibold tabular-nums">{row.clients}</span>
            </span>
          ))}
        </div>
      ) : (
        <ClientsWorldMap data={mapData} />
      )}
    </div>
  );
}
