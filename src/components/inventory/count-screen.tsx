"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, CheckCircle2, Minus, Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  adjustItem,
  deleteCount,
  finalizeCount,
  removeItem,
  scanBarcode,
} from "@/server/inventory";
import { countTotals, type CountItem } from "@/lib/inventory-count";
import type { InventoryCountItem } from "@/types/db";
import { BarcodeCamera } from "@/components/inventory/barcode-camera";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Item = Pick<
  InventoryCountItem,
  "id" | "barcode" | "sku" | "product_title" | "variant_title" | "qty" | "expected" | "unknown"
>;

export function CountScreen({
  countId,
  initialItems,
}: {
  countId: string;
  initialItems: Item[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initialItems);
  const [query, setQuery] = useState("");
  const [lastScan, setLastScan] = useState<Item | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // Scans run strictly one after another — concurrent inserts of the same new
  // barcode would race the unique index.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => inputRef.current?.focus(), []);

  const totals = useMemo(() => countTotals(items as CountItem[]), [items]);

  const applyRow = (row: Item) => {
    setItems((cur) => {
      const rest = cur.filter((i) => i.id !== row.id);
      return [row, ...rest];
    });
    setLastScan(row);
  };

  const scan = (raw: string) => {
    const barcode = raw.trim();
    if (barcode.length < 4) return;
    setQuery("");
    setScanning(true);
    queueRef.current = queueRef.current.then(async () => {
      const res = await scanBarcode({ countId, barcode });
      if (res.ok && res.data) {
        applyRow(res.data);
        if (res.data.unknown) toast.warning(`Barcode ${barcode} isn't in the catalog.`);
      } else if (!res.ok) {
        toast.error(res.error);
      }
      setScanning(false);
      inputRef.current?.focus();
    });
  };

  const setQty = (item: Item, qty: number) => {
    if (qty < 0) return;
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, qty } : i)));
    start(async () => {
      const res = await adjustItem({ itemId: item.id, qty });
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
      }
    });
  };

  const remove = (item: Item) => {
    setItems((cur) => cur.filter((i) => i.id !== item.id));
    start(async () => {
      const res = await removeItem(item.id);
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
      }
    });
  };

  const finalize = () =>
    start(async () => {
      const res = await finalizeCount(countId);
      if (res.ok) {
        toast.success("Count finalized.");
        router.refresh();
      } else {
        toast.error(res.error);
        setConfirmFinalize(false);
      }
    });

  const destroy = () =>
    start(async () => {
      const res = await deleteCount(countId);
      if (res.ok) {
        toast.success("Count deleted.");
        router.push("/admin/inventory");
      } else {
        toast.error(res.error);
      }
    });

  return (
    <div className="flex flex-col gap-5">
      {/* Running totals */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="font-semibold tabular-nums">{totals.countedUnits}</span>{" "}
          <span className="text-muted-foreground">units counted</span>
        </span>
        <span>
          <span className="font-semibold tabular-nums">{totals.scannedItems}</span>{" "}
          <span className="text-muted-foreground">items</span>
        </span>
        {totals.unknownItems > 0 && (
          <span className="text-amber-600">
            <span className="font-semibold tabular-nums">{totals.unknownItems}</span>{" "}
            unknown barcode{totals.unknownItems === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Scan input — an external scanner types the code + Enter here */}
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              scan(query);
            }}
          >
            <Input
              ref={inputRef}
              value={query}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Scan or type a barcode…"
              className="h-14 text-lg tabular-nums"
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="submit" size="lg" className="h-14" disabled={!query.trim()}>
              Add
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-14"
              onClick={() => setCameraOpen(true)}
              aria-label="Scan with the camera"
            >
              <Camera className="size-5" />
            </Button>
          </form>

          {lastScan && (
            <div
              className={
                "flex items-center gap-2 rounded-lg border p-3 text-sm " +
                (lastScan.unknown
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-emerald-500/40 bg-emerald-500/10")
              }
            >
              {lastScan.unknown ? (
                <TriangleAlert className="size-5 shrink-0 text-amber-600" />
              ) : (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
              )}
              <span className="min-w-0 truncate">
                <span className="font-semibold">{lastScan.product_title}</span>
                {lastScan.variant_title && (
                  <span className="text-muted-foreground"> · {lastScan.variant_title}</span>
                )}
                {lastScan.sku && (
                  <span className="text-muted-foreground"> · {lastScan.sku}</span>
                )}
              </span>
              <span className="ml-auto shrink-0 text-lg font-bold tabular-nums">
                ×{lastScan.qty}
              </span>
              {scanning && (
                <span className="text-muted-foreground shrink-0 text-xs">saving…</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Counted items, most recent first */}
      <Card>
        <CardContent className="pt-6">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing scanned yet — point the scanner at the first garment.
            </p>
          ) : (
            <div className="flex flex-col divide-y">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      {it.product_title}
                      {it.variant_title && (
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          {it.variant_title}
                        </span>
                      )}
                      {it.unknown && (
                        <span className="ml-1.5 text-xs text-amber-600">unknown</span>
                      )}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {it.sku ?? it.barcode}
                      {it.expected != null && ` · expected ${it.expected}`}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      disabled={pending || it.qty === 0}
                      aria-label={`One less ${it.product_title}`}
                      onClick={() => setQty(it, it.qty - 1)}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-10 text-center text-lg font-semibold tabular-nums">
                      {it.qty}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      disabled={pending}
                      aria-label={`One more ${it.product_title}`}
                      onClick={() => setQty(it, it.qty + 1)}
                    >
                      <Plus className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground size-9"
                      disabled={pending}
                      aria-label={`Remove ${it.product_title}`}
                      onClick={() => remove(it)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          className="text-destructive"
          disabled={pending}
          onClick={destroy}
        >
          Delete this count
        </Button>
        <Button size="lg" disabled={pending} onClick={() => setConfirmFinalize(true)}>
          Finalize count
        </Button>
      </div>

      <BarcodeCamera
        open={cameraOpen}
        onClose={() => {
          setCameraOpen(false);
          inputRef.current?.focus();
        }}
        onScan={scan}
      />

      <Dialog open={confirmFinalize} onOpenChange={(o) => !pending && setConfirmFinalize(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Finalize this count?</DialogTitle>
            <DialogDescription>
              This sweeps the whole Shopify catalog: every item with expected
              stock that was never scanned is added as missing. The finalized
              count then replaces the store&apos;s inventory book and locks.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending}
              onClick={() => setConfirmFinalize(false)}
            >
              Keep counting
            </Button>
            <Button className="flex-1" disabled={pending} onClick={finalize}>
              {pending ? "Finalizing…" : "Finalize"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
