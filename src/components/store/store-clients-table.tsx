"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, MessageCircle, Send, X } from "lucide-react";
import {
  storeSetInWhatsapp,
  storeMessageLink,
  type StoreClient,
} from "@/server/store-floor";
import type { MessageKey, MessageLanguage } from "@/lib/message-languages";
import { formatMoney } from "@/lib/commission";
import { cn } from "@/lib/utils";
import { ScrollTable } from "@/components/shared/scroll-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const KINDS: { key: MessageKey; label: string }[] = [
  { key: "hello", label: "Hello" },
  { key: "thank_you", label: "Thank-you" },
];
const LANGS: { code: MessageLanguage; label: string }[] = [
  { code: "pt", label: "🇧🇷 PT" },
  { code: "en", label: "🇺🇸 EN" },
  { code: "es", label: "🇪🇸 ES" },
];

export function StoreClientsTable({ rows }: { rows: StoreClient[] }) {
  const [sendFor, setSendFor] = useState<StoreClient | null>(null);
  return (
    <>
      <ScrollTable density="comfortable" maxHeight="60vh">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="py-2 font-medium">Client</th>
              <th className="hidden py-2 font-medium sm:table-cell">Brought in by</th>
              <th className="py-2 text-center font-medium">In WhatsApp</th>
              <th className="py-2 text-right font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <Row key={c.customerId} c={c} onSend={() => setSendFor(c)} />
            ))}
          </tbody>
        </table>
      </ScrollTable>
      <SendDialog client={sendFor} onClose={() => setSendFor(null)} />
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
      <td className="py-3 font-medium">
        <span className="flex flex-col">
          <span>{c.name}</span>
          <span className="text-muted-foreground text-xs">
            {c.country ? `${c.country.flag} ${c.country.name}` : "country unknown"}
            {c.spent != null ? ` · ${formatMoney(c.spent)}` : ""}
          </span>
        </span>
      </td>
      <td className="text-muted-foreground hidden py-3 text-sm sm:table-cell">
        {c.broughtInBy ?? "—"}
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

function SendDialog({
  client,
  onClose,
}: {
  client: StoreClient | null;
  onClose: () => void;
}) {
  const [key, setKey] = useState<MessageKey>("hello");
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<MessageLanguage | null>(null);

  const reset = () => {
    setKey("hello");
    setUrl(null);
    setLoading(null);
  };

  const pick = (language: MessageLanguage) => {
    if (!client) return;
    setLoading(language);
    setUrl(null);
    void storeMessageLink({ customerId: client.customerId, key, language }).then((res) => {
      setLoading(null);
      if (res.ok && res.data) setUrl(res.data.url);
      else if (!res.ok) toast.error(res.error);
    });
  };

  return (
    <Dialog
      open={client !== null}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Message {client?.name}</DialogTitle>
          <DialogDescription>
            Pick the message and a language — WhatsApp opens with it filled in.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          {KINDS.map((k) => (
            <Button
              key={k.key}
              size="lg"
              variant={key === k.key ? "default" : "outline"}
              className="h-12 flex-1"
              onClick={() => {
                setKey(k.key);
                setUrl(null);
              }}
            >
              {k.label}
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          {LANGS.map((l) => (
            <Button
              key={l.code}
              size="lg"
              variant="outline"
              className="h-14 flex-1"
              disabled={loading !== null}
              onClick={() => pick(l.code)}
            >
              {loading === l.code ? "…" : l.label}
            </Button>
          ))}
        </div>

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              reset();
              onClose();
            }}
            className="bg-emerald-600 hover:bg-emerald-700 flex h-14 items-center justify-center gap-2 rounded-md text-base font-medium text-white"
          >
            <Send className="size-5" /> Open WhatsApp
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
