"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, MessageCircle, X } from "lucide-react";
import {
  storeSetInWhatsapp,
  storeMessageLink,
  type StoreClient,
} from "@/server/store-floor";
import { formatMoney } from "@/lib/commission";
import { cn } from "@/lib/utils";
import { ScrollTable } from "@/components/shared/scroll-table";
import { ServerSortTh } from "@/components/shared/server-sort-head";
import { CountryCell } from "@/components/shared/country-cell";
import { ClientMessageDialog, type MessageTarget } from "@/components/shared/client-message-dialog";
import { Button } from "@/components/ui/button";

export function StoreClientsTable({
  rows,
  sort,
  dir,
  q,
  rep,
}: {
  rows: StoreClient[];
  sort: string;
  dir: "asc" | "desc";
  q: string;
  rep: string | null;
}) {
  const [sendFor, setSendFor] = useState<MessageTarget | null>(null);

  // Server-side sort links — sorting must run in the DB (this list is paginated),
  // so the header toggles ?sort=&dir= and the page re-queries. Preserve q/rep,
  // reset to page 1.
  const hrefFor = (nextSort: string, nextDir: "asc" | "desc") => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (rep) p.set("rep", rep);
    if (nextSort !== "recent") p.set("sort", nextSort);
    if (nextDir !== "desc") p.set("dir", nextDir);
    const s = p.toString();
    return s ? `/store/clients?${s}` : "/store/clients";
  };

  return (
    <>
      <ScrollTable density="comfortable" maxHeight="60vh">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-left">
              <ServerSortTh sortKey="name" sort={sort} dir={dir} hrefFor={hrefFor} className="py-2 font-medium">Client</ServerSortTh>
              <ServerSortTh sortKey="country" sort={sort} dir={dir} hrefFor={hrefFor} className="hidden py-2 font-medium sm:table-cell">Country</ServerSortTh>
              <th className="hidden py-2 font-medium sm:table-cell">Brought in by</th>
              <ServerSortTh sortKey="value" sort={sort} dir={dir} hrefFor={hrefFor} className="py-2 text-right font-medium">Value</ServerSortTh>
              <th className="py-2 text-center font-medium">In WhatsApp</th>
              <th className="py-2 text-right font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <Row key={c.customerId} c={c} onSend={() => setSendFor({ customerId: c.customerId, name: c.name })} />
            ))}
          </tbody>
        </table>
      </ScrollTable>
      <ClientMessageDialog
        client={sendFor}
        onClose={() => setSendFor(null)}
        getLink={storeMessageLink}
      />
    </>
  );
}

function Row({ c, onSend }: { c: StoreClient; onSend: () => void }) {
  const [on, setOn] = useState(c.inWhatsapp);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next); // optimistic
    start(async () => {
      const res = await storeSetInWhatsapp({ customerId: c.customerId, value: next });
      if (!res.ok) {
        setOn(!next);
        toast.error(res.error);
      }
    });
  };

  return (
    <tr className="border-b last:border-0">
      <td className="py-3 font-medium">{c.name}</td>
      <td className="hidden py-3 sm:table-cell">
        <CountryCell country={c.country} />
      </td>
      <td className="text-muted-foreground hidden py-3 text-sm sm:table-cell">
        {c.broughtInBy ?? "—"}
      </td>
      <td className="py-3 text-right tabular-nums">
        {c.spent != null ? formatMoney(c.spent) : "—"}
      </td>
      <td className="py-3 text-center">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={on}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md border",
            on
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {on ? <Check className="size-5" /> : <X className="size-4 opacity-40" />}
        </button>
      </td>
      <td className="py-3 text-right">
        <Button size="sm" variant="outline" onClick={onSend} disabled={!c.phone}>
          <MessageCircle className="mr-1.5 size-4" />
          {c.phone ? "Message" : "No phone"}
        </Button>
      </td>
    </tr>
  );
}
