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
import { CountryCell } from "@/components/shared/country-cell";
import { ClientMessageDialog, type MessageTarget } from "@/components/shared/client-message-dialog";
import { Button } from "@/components/ui/button";

export function StoreClientsTable({ rows }: { rows: StoreClient[] }) {
  const [sendFor, setSendFor] = useState<MessageTarget | null>(null);
  return (
    <>
      <ScrollTable density="comfortable" maxHeight="60vh">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="py-2 font-medium">Client</th>
              <th className="hidden py-2 font-medium sm:table-cell">Country</th>
              <th className="hidden py-2 font-medium sm:table-cell">Brought in by</th>
              <th className="py-2 text-right font-medium">Value</th>
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
