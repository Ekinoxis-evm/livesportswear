"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, CheckCircle2, Minus, Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  adjustItem,
  deleteCount,
  finalizeCount,
  peekBarcode,
  removeItem,
  scanBarcode,
  type BarcodePeek,
} from "@/server/inventory";
import { countTotals, type CountItem } from "@/lib/inventory-count";
import { isScannerBurst } from "@/lib/scanner-signal";
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
  | "id"
  | "barcode"
  | "sku"
  | "product_title"
  | "product_type"
  | "variant_title"
  | "qty"
  | "expected"
  | "unknown"
>;

const PAGE_SIZE = 25;
const NO_TYPE = "OTHER";

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
  const [confirmMode, setConfirmMode] = useState(true);
  const [pendingScan, setPendingScan] = useState<BarcodePeek | null>(null);
  const [scannerSeenAt, setScannerSeenAt] = useState<number | null>(null);
  // Keystroke timestamps for the current input value — a hardware scanner
  // "types" in a machine-speed burst, which is how we know it's connected.
  const keyTimesRef = useRef<number[]>([]);
  const [confirmQty, setConfirmQty] = useState(1);
  const [peeking, setPeeking] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // Scans run strictly one after another — concurrent inserts of the same new
  // barcode would race the unique index.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => inputRef.current?.focus(), []);

  const totals = useMemo(() => countTotals(items as CountItem[]), [items]);

  const typeOf = (it: Item) => it.product_type ?? NO_TYPE;

  const categories = useMemo(() => {
    const byType = new Map<string, number>();
    for (const it of items) byType.set(typeOf(it), (byType.get(typeOf(it)) ?? 0) + 1);
    return [...byType.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  }, [items]);

  const filtered = useMemo(
    () => (typeFilter ? items.filter((it) => typeOf(it) === typeFilter) : items),
    [items, typeFilter],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const pickType = (type: string | null) => {
    setTypeFilter(type);
    setPage(0);
  };

  const applyRow = (row: Item) => {
    setItems((cur) => {
      const rest = cur.filter((i) => i.id !== row.id);
      return [row, ...rest];
    });
    setLastScan(row);
  };

  const count = (barcode: string, qty: number) => {
    setScanning(true);
    queueRef.current = queueRef.current
      .then(async () => {
        const res = await scanBarcode({ countId, barcode, qty });
        if (res.ok && res.data) {
          applyRow(res.data);
          if (res.data.unknown) toast.warning(`Barcode ${barcode} isn't in the catalog.`);
        } else if (!res.ok) {
          toast.error(res.error);
        }
      })
      // A thrown call (network blip) must not poison the chain — every later
      // scan would silently no-op until a reload.
      .catch(() => {
        toast.error(`Scan ${barcode} failed to save — scan it again.`);
      })
      .finally(() => {
        setScanning(false);
        inputRef.current?.focus();
      });
  };

  const scan = (raw: string) => {
    const barcode = raw.trim();
    if (barcode.length < 4) return;
    // One product at a time while a confirm card is up.
    if (pendingScan || peeking) return;
    if (isScannerBurst(keyTimesRef.current)) setScannerSeenAt(Date.now());
    keyTimesRef.current = [];
    setQuery("");
    if (!confirmMode) {
      count(barcode, 1);
      return;
    }
    setPeeking(true);
    peekBarcode({ countId, barcode }).then((res) => {
      setPeeking(false);
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Barcode lookup failed." : res.error);
        inputRef.current?.focus();
        return;
      }
      setConfirmQty(1);
      setPendingScan(res.data);
    });
  };

  const confirmCount = () => {
    if (!pendingScan) return;
    count(pendingScan.barcode, confirmQty);
    setPendingScan(null);
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
              onChange={(e) => {
                if (e.target.value.length > query.length) {
                  keyTimesRef.current.push(performance.now());
                } else if (e.target.value === "") {
                  keyTimesRef.current = [];
                }
                setQuery(e.target.value);
              }}
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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-muted-foreground flex cursor-pointer select-none items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={confirmMode}
                onChange={(e) => setConfirmMode(e.target.checked)}
              />
              Confirm each scan — see the product before counting it
            </label>
            <span className="flex shrink-0 items-center gap-2 text-xs">
              {peeking && <span className="text-muted-foreground">looking up…</span>}
              {scannerSeenAt ? (
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-400">
                  <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
                  Scanner active ·{" "}
                  <span className="tabular-nums">
                    {new Date(scannerSeenAt).toTimeString().slice(0, 5)}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                  <span aria-hidden className="bg-muted-foreground/50 size-1.5 rounded-full" />
                  Scanner not detected — pair it in Bluetooth Settings, then scan
                  anything
                </span>
              )}
            </span>
          </div>

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

      {/* Counted items, categorized by type, most recent first */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          {items.length > 0 && categories.length > 1 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => pickType(null)}
                className={
                  "shrink-0 rounded-full border px-3 py-1 text-sm " +
                  (typeFilter === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted")
                }
              >
                All ({items.length})
              </button>
              {categories.map(([type, n]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => pickType(type)}
                  className={
                    "shrink-0 rounded-full border px-3 py-1 text-sm " +
                    (typeFilter === type
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted")
                  }
                >
                  {type} ({n})
                </button>
              ))}
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing scanned yet — point the scanner at the first garment.
            </p>
          ) : (
            <div className="flex flex-col divide-y">
              {shown.map((it) => (
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
                      {it.product_type && ` · ${it.product_type}`}
                      {it.expected != null && ` · in Shopify ${it.expected}`}
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

          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                ‹ Prev
              </Button>
              <span className="text-muted-foreground text-sm tabular-nums">
                Page {safePage + 1} of {pageCount} · {filtered.length} items
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
              >
                Next ›
              </Button>
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

      <Dialog
        open={!!pendingScan}
        onOpenChange={(o) => {
          if (!o) {
            setPendingScan(null);
            inputRef.current?.focus();
          }
        }}
      >
        <DialogContent className="max-w-sm">
          {pendingScan && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-start gap-2">
                  {pendingScan.unknown && (
                    <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
                  )}
                  <span>
                    {pendingScan.productTitle}
                    {pendingScan.variantTitle && (
                      <span className="text-muted-foreground ml-1.5 text-base font-normal">
                        {pendingScan.variantTitle}
                      </span>
                    )}
                  </span>
                </DialogTitle>
                <DialogDescription className="tabular-nums">
                  {pendingScan.sku ?? pendingScan.barcode}
                  {pendingScan.productType && ` · ${pendingScan.productType}`}
                  {pendingScan.shopifyQty != null &&
                    ` · in Shopify ${pendingScan.shopifyQty}`}
                  {pendingScan.currentQty > 0 &&
                    ` · already counted ${pendingScan.currentQty}`}
                  {pendingScan.unknown && " · not in the catalog"}
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11"
                  disabled={confirmQty <= 1}
                  aria-label="One unit less"
                  onClick={() => setConfirmQty((q) => Math.max(1, q - 1))}
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-14 text-center text-3xl font-bold tabular-nums">
                  {confirmQty}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11"
                  aria-label="One unit more"
                  onClick={() => setConfirmQty((q) => q + 1)}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setPendingScan(null);
                    inputRef.current?.focus();
                  }}
                >
                  Cancel
                </Button>
                <Button className="flex-1" onClick={confirmCount}>
                  Count {confirmQty === 1 ? "it" : `${confirmQty} units`}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmFinalize} onOpenChange={(o) => !pending && setConfirmFinalize(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Finalize this count?</DialogTitle>
            <DialogDescription>
              This sweeps the whole Shopify catalog: every item with stock in
              Shopify that was never scanned is added as missing. The finalized
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
