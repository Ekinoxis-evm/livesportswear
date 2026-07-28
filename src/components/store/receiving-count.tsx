"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, PackageCheck, Pencil } from "lucide-react";
import {
  storeSetCountedQty,
  storeToggleCounted,
  storeMarkReadyToPush,
} from "@/server/store-receiving";
import { matrixView, type MatrixRow, type ReceivingItem } from "@/lib/receiving";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollTable } from "@/components/shared/scroll-table";
import { cn } from "@/lib/utils";

export type CountItem = {
  id: string;
  barcode: string;
  sku: string | null;
  product_title: string;
  variant_title: string | null;
  expected: number | null;
  doc_qty: number | null;
  qty: number;
  hs_code: string | null;
  verified: boolean;
  unknown: boolean;
};

/**
 * The kiosk counting screen: the arrival as a reference × size grid, one number
 * input per size cell. Employees enter what physically arrived, tick each
 * reference once counted, and mark the whole arrival ready — then the admin
 * reviews and pushes to Shopify. Matching + push are never done here.
 */
export function ReceivingCount({ countId, items }: { countId: string; items: CountItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const view = useMemo(() => matrixView(items as ReceivingItem[]), [items]);
  // Matched lines that aren't a size-matrix SKU still need counting; unknown
  // lines are the admin's to resolve — shown, but they don't block "ready".
  const otherMatched = view.other.filter((i) => !i.unknown);
  const otherUnknown = view.other.filter((i) => i.unknown);

  const total = view.summary.references + otherMatched.length;
  const counted = view.summary.verifiedReferences + otherMatched.filter((i) => i.verified).length;
  const allCounted = total > 0 && counted === total;

  function toggle(itemIds: string[], nextCounted: boolean) {
    if (itemIds.length === 0) return;
    start(async () => {
      const res = await storeToggleCounted({ countId, itemIds, counted: nextCounted });
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  function ready() {
    start(async () => {
      const res = await storeMarkReadyToPush(countId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Counted — sent to the admin to push.");
      router.refresh();
    });
  }

  if (view.rows.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center">
          Nothing to count on this arrival yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Count the arrival</h2>
            <span className="text-muted-foreground text-sm tabular-nums">
              {counted}/{total} references counted
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Enter how many of each size actually arrived, then tick the reference. When every
            reference is ticked, mark the arrival ready for the admin to push.
          </p>

          <ScrollTable maxHeight="30rem" density="comfortable">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="py-2 pr-3 font-medium">Reference</th>
                  {view.sizes.map((s) => (
                    <th key={s} className="px-2 py-2 text-center font-medium tabular-nums">
                      {s}
                    </th>
                  ))}
                  <th className="py-2 pl-2 text-right font-medium">Doc</th>
                  <th className="py-2 pl-3 text-center font-medium">Counted</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <CountRow
                    key={`${row.reference}-${row.color}`}
                    row={row}
                    sizes={view.sizes}
                    countId={countId}
                    pending={pending}
                    onToggle={() => toggle(row.itemIds, !row.verified)}
                  />
                ))}
              </tbody>
            </table>
          </ScrollTable>
        </CardContent>
      </Card>

      {(otherMatched.length > 0 || otherUnknown.length > 0) && (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <h3 className="font-semibold">Other items</h3>
            <div className="flex flex-col divide-y">
              {otherMatched.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{item.product_title}</span>
                    {item.variant_title && (
                      <span className="text-muted-foreground ml-2 text-xs">{item.variant_title}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <QtyCell
                      countId={countId}
                      itemId={item.id ?? null}
                      value={item.qty}
                      docQty={item.doc_qty ?? 0}
                      disabled={pending || item.verified || !item.id}
                    />
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.verified ?? false}
                      aria-label={`Mark ${item.product_title} counted`}
                      disabled={pending || !item.id}
                      onClick={() => item.id && toggle([item.id], !item.verified)}
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded-md border transition-colors",
                        item.verified
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:bg-muted",
                      )}
                    >
                      {item.verified && <Check className="size-5" />}
                    </button>
                  </span>
                </div>
              ))}
              {otherUnknown.map((item) => (
                <div key={item.id} className="text-muted-foreground flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">{item.product_title}</span>
                  <span className="shrink-0 text-xs">needs the admin to match</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-muted-foreground text-sm tabular-nums">
          {view.summary.arrivedPieces} counted · {view.summary.docPieces} on the document
        </span>
        <Button size="lg" disabled={pending || !allCounted} onClick={ready}>
          {pending ? <Loader2 className="size-5 animate-spin" /> : <PackageCheck className="size-5" />}
          Mark ready to push
        </Button>
      </div>
    </div>
  );
}

function CountRow({
  row,
  sizes,
  countId,
  pending,
  onToggle,
}: {
  row: MatrixRow;
  sizes: string[];
  countId: string;
  pending: boolean;
  onToggle: () => void;
}) {
  const bySize = new Map(row.cells.map((c) => [c.size, c]));
  const locked = row.verified; // ticked references lock so a stray tap can't change a count

  return (
    <tr className={cn("border-b last:border-0", locked && "bg-primary/5")}>
      <td className="py-2 pr-3 font-medium">
        <span className="font-mono">{row.reference}</span>
        <span className="text-muted-foreground ml-1.5 font-mono text-xs">{row.color}</span>
        <span className="text-muted-foreground ml-2 text-xs tabular-nums">= {row.arrivedTotal}</span>
      </td>
      {sizes.map((s) => {
        const cell = bySize.get(s);
        if (!cell) {
          return (
            <td key={s} className="px-2 py-2 text-center">
              <span className="text-muted-foreground/30">·</span>
            </td>
          );
        }
        return (
          <td key={s} className="px-1 py-2 text-center">
            <QtyCell
              countId={countId}
              itemId={cell.itemId}
              value={cell.arrivedQty}
              docQty={cell.docQty}
              disabled={pending || locked || !cell.itemId}
            />
          </td>
        );
      })}
      <td className="text-muted-foreground py-2 pl-2 text-right tabular-nums">{row.docTotal}</td>
      <td className="py-2 pl-3 text-center">
        <button
          type="button"
          role="checkbox"
          aria-checked={row.verified}
          aria-label={`Mark ${row.reference} counted`}
          disabled={pending || row.itemIds.length === 0}
          onClick={onToggle}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md border transition-colors",
            row.verified
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input hover:bg-muted",
            pending && "opacity-50",
          )}
        >
          {row.verified ? <Check className="size-5" /> : <Pencil className="size-4 opacity-40" />}
        </button>
      </td>
    </tr>
  );
}

/** One size cell: local while typing, committed to the server on blur / Enter. */
function QtyCell({
  countId,
  itemId,
  value,
  docQty,
  disabled,
}: {
  countId: string;
  itemId: string | null;
  value: number;
  docQty: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [local, setLocal] = useState<string>(String(value));
  const [saving, start] = useTransition();

  // Server value changed under us (refresh) — resync unless we're mid-edit.
  const shown = local;

  function commit() {
    const next = Math.max(0, parseInt(shown || "0", 10) || 0);
    if (!itemId || next === value) return;
    start(async () => {
      const res = await storeSetCountedQty({ countId, itemId, qty: next });
      if (!res.ok) {
        toast.error(res.error);
        setLocal(String(value));
      } else {
        router.refresh();
      }
    });
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      disabled={disabled || saving}
      value={shown}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      aria-label={`Counted quantity (document says ${docQty})`}
      className={cn(
        "h-11 w-14 rounded-md border text-center text-base tabular-nums",
        Number(shown) !== docQty && Number(shown) > 0 && "border-amber-500/60",
        disabled && "opacity-60",
      )}
    />
  );
}
