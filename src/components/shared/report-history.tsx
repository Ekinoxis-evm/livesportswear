"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, ClipboardPaste, Send } from "lucide-react";
import type { ReportHistoryRow } from "@/lib/report-history";
import type { ActionResult } from "@/server/shared";
import { ScrollTable } from "@/components/shared/scroll-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cleanNote, NOTE_MAX } from "@/lib/report-note";
import { formatMoney } from "@/lib/commission";
import { formatPct } from "@/lib/conversion";
import { weekdayName } from "@/lib/weekdays";
import { shortDate } from "@/lib/format-date";

/**
 * Which days went out, and a way to send the ones that didn't.
 *
 * The column that matters is the LAST one: a day with floor activity and no
 * send is called out, because that is the state that hid for five days in
 * August 2026 with nothing in the app able to show it.
 *
 * Shared by the kiosk close-day tab and admin Performance→Daily; each binds its
 * own `resend` action, the same way `RecipientsManager` does.
 */
export function ReportHistory({
  rows,
  currency,
  resend,
  density = "compact",
}: {
  rows: ReportHistoryRow[];
  currency: string;
  resend: (
    businessDate: string,
    note?: string,
  ) => Promise<ActionResult<{ sentTo: number }>>;
  density?: "compact" | "comfortable";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  // A day rebuilt weeks later almost always needs saying WHY — it is late, or a
  // figure is missing. Asking once, here, beats a bare table of numbers landing
  // on an owner with no explanation.
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState("");

  /** Safari refuses a clipboard read outside a gesture — say so, don't look broken. */
  async function pasteNote() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("The clipboard is empty.");
        return;
      }
      setNote((prev) => (prev.trim() ? `${prev.trimEnd()}\n${text}` : text));
    } catch {
      toast.error("Couldn't read the clipboard — long-press the box and choose Paste.");
    }
  }

  const send = (businessDate: string) => {
    setAsking(null);
    setBusy(businessDate);
    start(async () => {
      const res = await resend(businessDate, cleanNote(note) ?? undefined);
      setBusy(null);
      if (!res.ok) {
        toast.error(res.error ?? "The report couldn't be sent.");
        return;
      }
      toast.success(
        `Report for ${shortDate(businessDate)} sent to ${res.data?.sentTo ?? 0} recipient${
          res.data?.sentTo === 1 ? "" : "s"
        }.`,
      );
      setNote("");
      router.refresh();
    });
  };

  const missing = rows.filter((r) => r.missing).length;

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No days to show yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {missing > 0 && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0" />
          {missing} day{missing === 1 ? "" : "s"} worked with no report sent.
        </p>
      )}

      <ScrollTable density={density} maxHeight="24rem">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="py-2 font-medium">Day</th>
              <th className="py-2 text-right font-medium">Attended</th>
              <th className="hidden py-2 text-right font-medium sm:table-cell">Sold</th>
              <th className="hidden py-2 text-right font-medium sm:table-cell">
                Conversion
              </th>
              <th className="py-2 text-right font-medium">Net sales</th>
              <th className="py-2 font-medium">Report</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.businessDate} className="border-b last:border-0">
                <td className="py-2 font-medium whitespace-nowrap">
                  {weekdayName(r.businessDate).slice(0, 3)} {shortDate(r.businessDate)}
                </td>
                <td className="py-2 text-right tabular-nums">{r.attended}</td>
                <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                  {r.sold}
                </td>
                <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                  {r.conversion === null ? "—" : formatPct(r.conversion)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {r.netSales === null
                    ? "—"
                    : formatMoney(r.netSales, r.currency ?? currency)}
                </td>
                <td className="py-2">
                  {r.missing ? (
                    <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                      not sent
                    </Badge>
                  ) : r.sendCount > 0 ? (
                    <span className="text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
                      <Check className="size-3.5 shrink-0 text-emerald-600" />
                      {r.sendCount > 1 ? `sent ${r.sendCount}×` : "sent"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <Button
                    size="sm"
                    variant={r.missing ? "default" : "outline"}
                    disabled={pending}
                    onClick={() => {
                      setNote("");
                      setAsking(r.businessDate);
                    }}
                  >
                    <Send className="size-3.5" />
                    {busy === r.businessDate
                      ? "Sending…"
                      : r.sendCount > 0
                        ? "Resend"
                        : "Send"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>

      <p className="text-muted-foreground text-xs">
        Sending re-reads that day from Shopify, so a refund settled since can shift
        a figure. Reports go only to the store&apos;s saved recipients.
      </p>

      <Dialog
        open={asking !== null}
        onOpenChange={(o) => {
          if (!o && !pending) setAsking(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Send the report for {asking ? shortDate(asking) : ""}
            </DialogTitle>
            <DialogDescription>
              Add a note if the numbers need explaining — it goes at the top of the
              email. Optional.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            maxLength={NOTE_MAX}
            rows={5}
            className="min-h-32 text-base"
            placeholder="e.g. sent late — Shopify was disconnected, so there are no sales figures."
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={pasteNote}>
                <ClipboardPaste className="size-4" /> Paste
              </Button>
              {note.length > 0 && (
                <Button type="button" variant="ghost" onClick={() => setNote("")}>
                  Clear
                </Button>
              )}
            </div>
            <span className="text-muted-foreground text-xs tabular-nums">
              {note.length}/{NOTE_MAX}
            </span>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setAsking(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() => asking && send(asking)}
            >
              <Send className="size-4" /> Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
