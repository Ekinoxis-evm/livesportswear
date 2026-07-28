"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, PackagePlus, RotateCcw, Send, Trash2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  uploadReceivingDoc,
  extractDocument,
  commitExtraction,
  matchUnknownItem,
  sendToKioskCounting,
  reopenReceiving,
  receiveStock,
} from "@/server/receiving";
import { removeItem } from "@/server/inventory";
import {
  matrixView,
  extractMatrix,
  type ExtractedLine,
  type MatrixView,
  type ReceivingItem,
} from "@/lib/receiving";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ReceiveItem = {
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

export type ReceiveStatus = "open" | "counting" | "ready";

export function ReceiveScreen({
  countId,
  items,
  status,
}: {
  countId: string;
  items: ReceiveItem[];
  status: ReceiveStatus;
}) {
  // open: admin uploads → matches → hands to the kiosk. counting: the kiosk is
  // entering physical counts (admin watches, read-only). ready: kiosk done,
  // admin reviews + pushes.
  if (status === "open" && items.length === 0) {
    return <ExtractPhase countId={countId} />;
  }
  if (status === "open") {
    return <ReviewPhase countId={countId} items={items} />;
  }
  return <AdminCountPhase countId={countId} items={items} status={status} />;
}

// ---------------------------------------------------------------------------
// Phase A — upload a document, extract line items, review, then match
// ---------------------------------------------------------------------------
function ExtractPhase({ countId }: { countId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<ExtractedLine[] | null>(null);
  // Read-only reference × size preview of what was read from the document.
  const matrix = useMemo(() => (lines ? extractMatrix(lines) : null), [lines]);

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("countId", countId);
    fd.set("file", file);
    start(async () => {
      const up = await uploadReceivingDoc(fd);
      if (!up.ok) {
        toast.error(up.error);
        return;
      }
      const ex = await extractDocument({ countId });
      if (!ex.ok || !ex.data) {
        toast.error(ex.ok ? "No line items found." : ex.error);
        return;
      }
      if (ex.data.lines.length === 0) {
        toast.warning("No line items were found in that document.");
      }
      setLines(ex.data.lines);
    });
  }

  function commit() {
    if (!lines) return;
    const clean = lines.filter((l) => l.code.trim() && l.qty > 0);
    if (clean.length === 0) {
      toast.error("Add at least one line with a code and quantity.");
      return;
    }
    start(async () => {
      const res = await commitExtraction({ countId, lines: clean });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Matched ${res.data?.matched ?? 0} item(s)${res.data?.unmatched ? `, ${res.data.unmatched} flagged` : ""}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col items-start gap-3 pt-6">
          <div>
            <h2 className="font-medium">1 · Upload the arrival document</h2>
            <p className="text-muted-foreground text-sm">
              A CSV/Excel export, or a PDF/photo of the invoice or packing slip. The line
              items are extracted for you to review — nothing is written yet.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf,image/*"
            className="hidden"
            onChange={onUpload}
          />
          <Button variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {pending ? "Reading…" : "Choose document"}
          </Button>
        </CardContent>
      </Card>

      {lines && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">2 · Review extracted lines</h2>
              <span className="text-muted-foreground text-sm">
                {matrix && matrix.rows.length > 0
                  ? `${matrix.rows.length} reference(s) · ${matrix.grandTotal} pieces`
                  : `${lines.length} line(s)`}
              </span>
            </div>

            {matrix && matrix.rows.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Color</TableHead>
                      {matrix.sizes.map((s) => (
                        <TableHead key={s} className="text-right tabular-nums">
                          {s}
                        </TableHead>
                      ))}
                      <TableHead className="text-right font-semibold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matrix.rows.map((row) => (
                      <TableRow key={`${row.reference}-${row.color}`}>
                        <TableCell className="font-mono text-xs font-medium">{row.reference}</TableCell>
                        <TableCell className="font-mono text-xs">{row.color}</TableCell>
                        {matrix.sizes.map((s) => {
                          const cell = row.cells.find((c) => c.size === s);
                          return (
                            <TableCell key={s} className="text-right tabular-nums">
                              {cell ? cell.qty : <span className="text-muted-foreground/40">·</span>}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right font-semibold tabular-nums">{row.total}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2">
                      <TableCell colSpan={2 + matrix.sizes.length} className="text-right font-medium">
                        All pieces
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{matrix.grandTotal}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}

            {matrix && matrix.rows.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {matrix.other.length > 0
                  ? `Plus ${matrix.other.length} line(s) without a size-matrix code — adjust below.`
                  : "Adjust any line below, then match to Shopify."}
              </p>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">
                        {line.code}
                        <span className="text-muted-foreground ml-1.5 uppercase">
                          {line.codeType}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{line.description}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={line.qty}
                          className="ml-auto h-8 w-20 text-right tabular-nums"
                          onChange={(e) =>
                            setLines((prev) =>
                              prev!.map((l, j) =>
                                j === i ? { ...l, qty: Math.max(0, parseInt(e.target.value || "0", 10)) } : l,
                              ),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          aria-label="Remove line"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setLines((prev) => prev!.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button className="self-end" disabled={pending} onClick={commit}>
              Match to Shopify & continue
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A read-only reference × size grid for the admin views. Shows the document
// quantity per size and, once the kiosk is counting, the counted quantity + a
// per-reference counted tick. The admin never edits counts here.
// ---------------------------------------------------------------------------
function AdminMatrix({ view, showCounted }: { view: MatrixView; showCounted: boolean }) {
  const { sizes, rows } = view;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>HS</TableHead>
            {sizes.map((s) => (
              <TableHead key={s} className="text-right tabular-nums">{s}</TableHead>
            ))}
            <TableHead className="text-right">Doc</TableHead>
            {showCounted && <TableHead className="text-right">Counted</TableHead>}
            {showCounted && <TableHead className="text-center">✓</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const bySize = new Map(row.cells.map((c) => [c.size, c]));
            return (
              <TableRow key={`${row.reference}-${row.color}`}>
                <TableCell className="font-mono text-xs font-medium">
                  {row.reference}
                  <span className="text-muted-foreground ml-1.5">{row.color}</span>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
                  {row.hsCode ?? "—"}
                </TableCell>
                {sizes.map((s) => {
                  const cell = bySize.get(s);
                  const qty = showCounted ? cell?.arrivedQty : cell?.docQty;
                  return (
                    <TableCell key={s} className="text-right tabular-nums">
                      {cell ? qty : <span className="text-muted-foreground/30">·</span>}
                    </TableCell>
                  );
                })}
                <TableCell className="text-muted-foreground text-right tabular-nums">{row.docTotal}</TableCell>
                {showCounted && (
                  <TableCell
                    className={cn(
                      "text-right font-semibold tabular-nums",
                      row.arrivedTotal !== row.docTotal && "text-amber-600",
                    )}
                  >
                    {row.arrivedTotal}
                  </TableCell>
                )}
                {showCounted && (
                  <TableCell className="text-center">
                    {row.verified ? (
                      <Check className="text-primary mx-auto size-4" />
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase B (open) — the admin reviews the match, resolves any unmatched lines,
// then hands the arrival to the kiosk to physically count.
// ---------------------------------------------------------------------------
function ReviewPhase({ countId, items }: { countId: string; items: ReceiveItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const view = useMemo(() => matrixView(items as ReceivingItem[]), [items]);
  const unmatched = view.other.filter((i) => i.unknown);
  const matchedRefs = view.summary.references + view.other.filter((i) => !i.unknown).length;

  function drop(item: ReceivingItem) {
    if (!item.id) return;
    const id = item.id;
    start(async () => {
      const res = await removeItem(id);
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  function match(item: ReceivingItem, barcode: string) {
    const code = barcode.trim();
    if (!code || !item.id) return;
    const id = item.id;
    start(async () => {
      const res = await matchUnknownItem({ itemId: id, barcode: code });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Matched.");
        router.refresh();
      }
    });
  }

  function send() {
    start(async () => {
      const res = await sendToKioskCounting(countId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Sent to the kiosk to count.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {view.rows.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <div>
              <h2 className="font-medium">Review the match, then send to the kiosk</h2>
              <p className="text-muted-foreground text-sm">
                Confirm the references matched Shopify and resolve any unmatched lines below.
                The store will count the physical arrival on the kiosk.
              </p>
            </div>
            <AdminMatrix view={view} showCounted={false} />
          </CardContent>
        </Card>
      )}

      {view.other.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <h2 className="font-medium">Other lines</h2>
            <p className="text-muted-foreground text-sm">
              Lines without a size-matrix SKU. Match any unmatched barcodes, or drop junk rows.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Document</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.other.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <span className="font-medium">{item.product_title}</span>
                        {item.variant_title && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            {item.variant_title}
                          </span>
                        )}
                        {item.unknown && (
                          <>
                            <Badge variant="outline" className="ml-2 text-amber-600">
                              unmatched
                            </Badge>
                            <MatchInput disabled={pending} onMatch={(bc) => match(item, bc)} />
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {item.doc_qty ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          aria-label="Remove line"
                          disabled={pending}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => drop(item)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-muted-foreground text-sm tabular-nums">
          {matchedRefs} reference(s) matched
          {unmatched.length > 0 && ` · ${unmatched.length} unmatched`}
        </span>
        <Button disabled={pending || matchedRefs === 0} onClick={send}>
          <Send className="size-4" /> Send to kiosk for counting
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase C (counting / ready) — the kiosk owns the physical count. The admin
// watches (read-only), can reopen for edits, and pushes once it's ready.
// ---------------------------------------------------------------------------
function AdminCountPhase({
  countId,
  items,
  status,
}: {
  countId: string;
  items: ReceiveItem[];
  status: "counting" | "ready";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const view = useMemo(() => matrixView(items as ReceivingItem[]), [items]);
  const isReady = status === "ready";
  const arrivedTotal =
    view.summary.arrivedPieces + view.other.filter((i) => !i.unknown).reduce((s, i) => s + i.qty, 0);

  function reopen() {
    start(async () => {
      const res = await reopenReceiving(countId);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Reopened for edits.");
        router.refresh();
      }
    });
  }

  function receive() {
    start(async () => {
      const res = await receiveStock(countId);
      setConfirming(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Received ${res.data?.received ?? 0} item(s) into Shopify.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">
                {isReady ? "Counted — review and push" : "The store is counting this arrival"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {isReady
                  ? "The kiosk finished counting. Review the counted quantities, then push the arrival onto Shopify stock."
                  : "Employees are entering the physical counts on the kiosk. You can push once they mark it ready."}
              </p>
            </div>
            <Badge variant={isReady ? "default" : "secondary"}>{isReady ? "ready" : "counting"}</Badge>
          </div>
          <AdminMatrix view={view} showCounted />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="outline" disabled={pending} onClick={reopen}>
          <RotateCcw className="size-4" /> Reopen for edits
        </Button>
        <span className="text-muted-foreground text-sm tabular-nums">{arrivedTotal} counted</span>
        {isReady && (
          <Button disabled={pending || arrivedTotal === 0} onClick={() => setConfirming(true)}>
            <PackagePlus className="size-4" /> Push to Shopify
          </Button>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={(o) => !pending && setConfirming(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Push onto Shopify stock?</DialogTitle>
            <DialogDescription>
              This adds the counted quantities on top of current Shopify stock
              (matched lines only) and closes this session. It can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={receive}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Push {arrivedTotal} units
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MatchInput({ disabled, onMatch }: { disabled: boolean; onMatch: (barcode: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <span className="mt-1 flex items-center gap-1.5">
      <Input
        value={value}
        disabled={disabled}
        placeholder="Enter the correct barcode"
        className="h-7 w-48 text-xs"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onMatch(value);
        }}
      />
      <Button size="sm" variant="outline" disabled={disabled || !value.trim()} onClick={() => onMatch(value)}>
        Match
      </Button>
    </span>
  );
}
