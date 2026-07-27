"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import type { ActionResult } from "@/server/shared";
import { MESSAGE_KEYS, type MessageKey, type MessageLanguage } from "@/lib/message-languages";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type MessageTarget = { customerId: string; name: string };

const KIND_LABEL: Record<MessageKey, string> = { hello: "Hello", thank_you: "Thank-you" };
const LANGS: { code: MessageLanguage; label: string }[] = [
  { code: "pt", label: "🇧🇷 PT" },
  { code: "en", label: "🇺🇸 EN" },
  { code: "es", label: "🇪🇸 ES" },
];

/**
 * Pick a message kind + language and open WhatsApp with it filled in. Shared by
 * the kiosk and portal client lists — the surface supplies `getLink`, which
 * resolves the template + phone + signature server-side and returns a wa.me URL.
 */
export function ClientMessageDialog({
  client,
  onClose,
  getLink,
}: {
  client: MessageTarget | null;
  onClose: () => void;
  getLink: (args: {
    customerId: string;
    key: MessageKey;
    language: MessageLanguage;
  }) => Promise<ActionResult<{ url: string }>>;
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
    void getLink({ customerId: client.customerId, key, language }).then((res) => {
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
          {MESSAGE_KEYS.map((k) => (
            <Button
              key={k}
              size="lg"
              variant={key === k ? "default" : "outline"}
              className="h-12 flex-1"
              onClick={() => {
                setKey(k);
                setUrl(null);
              }}
            >
              {KIND_LABEL[k]}
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
