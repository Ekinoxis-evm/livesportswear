"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCheck, Loader2, PackagePlus, Trash2 } from "lucide-react";
import { deleteCount } from "@/server/inventory";
import { useTableSort } from "@/lib/use-table-sort";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export type SessionRow = {
  id: string;
  storeName: string;
  note: string | null;
  restock: boolean;
  startedAt: string; // ISO, for sorting
  startedLabel: string; // pre-formatted in the store's tz
  status: string; // open | counting | ready | final
  countedUnits: number | null;
  expectedUnits: number | null;
};

/** The status pill — understands the receiving kiosk-counting lifecycle. */
function StatusBadge({ status, restock }: { status: string; restock: boolean }) {
  if (status === "final") return <Badge variant="secondary">{restock ? "received" : "final"}</Badge>;
  if (status === "counting") return <Badge>counting</Badge>;
  if (status === "ready") return <Badge>ready to push</Badge>;
  return <Badge>{restock ? "receiving" : "counting"}</Badge>; // open
}

export function SessionsTable({ rows }: { rows: SessionRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<SessionRow | null>(null);

  const { rows: sorted, sort, onSort } = useTableSort(
    rows,
    {
      store: (c) => c.storeName,
      type: (c) => (c.restock ? "receiving" : "counting"),
      started: (c) => c.startedAt,
      status: (c) => c.status,
      units: (c) => c.countedUnits,
      expected: (c) => c.expectedUnits,
    },
    { key: "started", dir: "desc" },
  );

  function confirmDelete() {
    if (!target) return;
    const id = target.id;
    start(async () => {
      const res = await deleteCount(id);
      setTarget(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Deleted.");
      router.refresh();
    });
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sortKey="store" sort={sort} onSort={onSort}>Store</TableHead>
            <TableHead sortKey="type" sort={sort} onSort={onSort}>Type</TableHead>
            <TableHead sortKey="started" sort={sort} onSort={onSort}>Started</TableHead>
            <TableHead sortKey="status" sort={sort} onSort={onSort}>Status</TableHead>
            <TableHead sortKey="units" sort={sort} onSort={onSort} className="text-right">
              <span className="hidden sm:inline">Counted / </span>Units
            </TableHead>
            <TableHead sortKey="expected" sort={sort} onSort={onSort} className="hidden text-right sm:table-cell">
              Expected
            </TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">
                {c.storeName}
                {c.note && (
                  <span className="text-muted-foreground ml-2 text-xs">{c.note}</span>
                )}
              </TableCell>
              <TableCell>
                <span
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium " +
                    (c.restock
                      ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                      : "border-primary/40 text-primary")
                  }
                >
                  {c.restock ? (
                    <PackagePlus className="size-3.5" />
                  ) : (
                    <ClipboardCheck className="size-3.5" />
                  )}
                  {c.restock ? "Receiving" : "Counting"}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {c.startedLabel}
              </TableCell>
              <TableCell>
                <StatusBadge status={c.status} restock={c.restock} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {c.countedUnits ?? "—"}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">
                {c.restock ? "—" : (c.expectedUnits ?? "—")}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Link
                    href={`/admin/inventory/${c.id}`}
                    className="text-primary text-sm underline-offset-4 hover:underline"
                  >
                    {c.status === "final" ? "Report" : "Continue"}
                  </Link>
                  {c.status !== "final" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Delete this process"
                      disabled={pending}
                      onClick={() => setTarget(c)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={target != null} onOpenChange={(o) => !pending && !o && setTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this {target?.restock ? "arrival" : "count"}?</DialogTitle>
            <DialogDescription>
              This permanently removes the in-progress {target?.restock ? "receiving" : "count"}
              {target?.storeName ? ` for ${target.storeName}` : ""} and everything scanned so far.
              Nothing in Shopify or the book changes. It can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={confirmDelete}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
