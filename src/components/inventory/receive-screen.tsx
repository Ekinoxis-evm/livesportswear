"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, PackagePlus, Trash2, UploadCloud } from "lucide-react";
import {
  uploadReceivingDoc,
  extractDocument,
  commitExtraction,
  matchUnknownItem,
  setReferenceVerified,
  receiveStock,
} from "@/server/receiving";
import { removeItem } from "@/server/inventory";
import { matrixView, type ExtractedLine, type MatrixRow, type ReceivingItem } from "@/lib/receiving";
import { ReceiveMatrix } from "@/components/inventory/receive-matrix";
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

export function ReceiveScreen({
  countId,
  items,
}: {
  countId: string;
  items: ReceiveItem[];
}) {
  // Phase A (upload + extract + review) until the session has matched items.
  if (items.length === 0) {
    return <ExtractPhase countId={countId} />;
  }
  return <VerifyPhase countId={countId} items={items} />;
}

// ---------------------------------------------------------------------------
// Phase A — upload a document, extract line items, review, then match
// ---------------------------------------------------------------------------
function ExtractPhase({ countId }: { countId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<ExtractedLine[] | null>(null);

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
              <span className="text-muted-foreground text-sm">{lines.length} line(s)</span>
            </div>
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
// Phase B — physically verify arrivals, preview the merge, receive
// ---------------------------------------------------------------------------
function VerifyPhase({ countId, items }: { countId: string; items: ReceiveItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [override, setOverride] = useState(false);

  const view = useMemo(() => matrixView(items as ReceivingItem[]), [items]);
  const matchedOther = view.other.filter((i) => !i.unknown);

  const arrivedTotal =
    view.summary.arrivedPieces + view.other.reduce((s, i) => s + i.qty, 0);
  const totalRefs = view.summary.references + matchedOther.length;
  const verifiedRefs =
    view.summary.verifiedReferences + matchedOther.filter((i) => i.verified).length;
  const allVerified = totalRefs > 0 && verifiedRefs === totalRefs;
  const canReceive = arrivedTotal > 0 && (allVerified || override);

  function toggleRow(row: MatrixRow) {
    if (row.itemIds.length === 0) return;
    start(async () => {
      const res = await setReferenceVerified({
        countId,
        itemIds: row.itemIds,
        verified: !row.verified,
      });
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  function toggleItem(item: ReceivingItem) {
    if (!item.id) return;
    const id = item.id;
    start(async () => {
      const res = await setReferenceVerified({
        countId,
        itemIds: [id],
        verified: !item.verified,
      });
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

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
      {view.rows.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <div>
              <h2 className="font-medium">Review the arrival, then verify each reference</h2>
              <p className="text-muted-foreground text-sm">
                Tick a reference once you&apos;ve physically checked its units — that accepts
                the document quantities as arrived. Untick to reset it to zero.
              </p>
            </div>
            <ReceiveMatrix view={view} pending={pending} onToggle={toggleRow} />
          </CardContent>
        </Card>
      )}

      {view.other.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <h2 className="font-medium">Other lines</h2>
            <p className="text-muted-foreground text-sm">
              Lines without a size-matrix SKU. Match any unmatched barcodes, then verify.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Document</TableHead>
                    <TableHead className="text-center">Verified</TableHead>
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
                      <TableCell className="text-center">
                        {item.unknown ? (
                          <span className="text-muted-foreground/40">—</span>
                        ) : (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={item.verified}
                            aria-label={`Verify ${item.product_title}`}
                            disabled={pending}
                            onClick={() => toggleItem(item)}
                            className={
                              "inline-flex size-6 items-center justify-center rounded-md border " +
                              (item.verified
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input hover:bg-muted")
                            }
                          >
                            {item.verified && <Check className="size-4" />}
                          </button>
                        )}
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
        {!allVerified && arrivedTotal > 0 && (
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            Receive without verifying all references
          </label>
        )}
        <span className="text-muted-foreground text-sm tabular-nums">
          {verifiedRefs}/{totalRefs} verified · {arrivedTotal} units
        </span>
        <Button disabled={pending || !canReceive} onClick={() => setConfirming(true)}>
          <PackagePlus className="size-4" /> Receive stock
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={(o) => !pending && setConfirming(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receive into Shopify?</DialogTitle>
            <DialogDescription>
              This adds the arrived quantities on top of current Shopify stock
              (matched lines only) and closes this session. It can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={receive}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Receive {arrivedTotal} units
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
