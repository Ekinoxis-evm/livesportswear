"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollTable } from "@/components/shared/scroll-table";
import type { MatrixRow, MatrixView } from "@/lib/receiving";

/**
 * The arrival document as its own reference × size grid: one row per
 * (reference, color) with the HS code, description, a quantity cell per size,
 * and a row total. A verify checkbox per reference accepts that reference's
 * document quantities as physically arrived. Read-only otherwise — the point is
 * a fast review before the stock is booked.
 */
export function ReceiveMatrix({
  view,
  pending,
  onToggle,
}: {
  view: MatrixView;
  pending: boolean;
  onToggle: (row: MatrixRow) => void;
}) {
  const { sizes, rows, summary } = view;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <Stat value={summary.references} label="references" />
        <Stat value={summary.docPieces} label="pieces (document)" />
        <Stat value={summary.arrivedPieces} label="pieces verified" />
        <Stat
          value={`${summary.verifiedReferences}/${summary.references}`}
          label="references verified"
        />
      </div>

      <ScrollTable maxHeight="34rem">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="py-2 pr-3 font-medium">Reference</th>
              <th className="py-2 pr-3 font-medium">HS code</th>
              <th className="hidden py-2 pr-3 font-medium sm:table-cell">Description</th>
              {sizes.map((s) => (
                <th key={s} className="py-2 px-2 text-right font-medium tabular-nums">
                  {s}
                </th>
              ))}
              <th className="py-2 pl-2 text-right font-medium">Total</th>
              <th className="py-2 pl-3 text-center font-medium">Verified</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const bySize = new Map(row.cells.map((c) => [c.size, c]));
              return (
                <tr key={`${row.reference}-${row.color}`} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">
                    <span className="font-mono">{row.reference}</span>
                    <span className="text-muted-foreground ml-1.5 font-mono text-xs">
                      {row.color}
                    </span>
                  </td>
                  <td className="text-muted-foreground py-2 pr-3 font-mono text-xs tabular-nums">
                    {row.hsCode ?? "—"}
                  </td>
                  <td className="text-muted-foreground hidden max-w-56 truncate py-2 pr-3 sm:table-cell">
                    {row.description}
                  </td>
                  {sizes.map((s) => {
                    const cell = bySize.get(s);
                    return (
                      <td key={s} className="py-2 px-2 text-right tabular-nums">
                        {cell ? (
                          <span className={cn(cell.docQty === 0 && "text-muted-foreground/40")}>
                            {cell.docQty}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30">·</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2 pl-2 text-right font-semibold tabular-nums">{row.docTotal}</td>
                  <td className="py-2 pl-3 text-center">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={row.verified}
                      aria-label={`Verify ${row.reference}`}
                      disabled={pending}
                      onClick={() => onToggle(row)}
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-md border transition-colors",
                        row.verified
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:bg-muted",
                        pending && "opacity-50",
                      )}
                    >
                      {row.verified && <Check className="size-4" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
    </span>
  );
}
