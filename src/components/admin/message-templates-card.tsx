"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { saveMessageTemplate } from "@/server/message-templates";
import type { MessageKey, MessageLanguage } from "@/lib/message-languages";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Bodies = Record<MessageLanguage, string>;

const LANGS: { code: MessageLanguage; label: string }[] = [
  { code: "pt", label: "🇧🇷 Portuguese" },
  { code: "en", label: "🇺🇸 English" },
  { code: "es", label: "🇪🇸 Spanish" },
];

const KINDS: { key: MessageKey; title: string; blurb: string }[] = [
  {
    key: "thank_you",
    title: "Thank-you (after a sale)",
    blurb: "Sent right after a purchase. {name} = first name; the items bought are appended automatically.",
  },
  {
    key: "hello",
    title: "Hello (reach out)",
    blurb: "A greeting you can send any time. {name} = first name; {last_product} = the last thing they bought.",
  },
];

/**
 * Admin editor for the client WhatsApp messages — a thank-you and a hello, each
 * in 3 languages. Collapsed by default (`<details>`).
 */
export function MessageTemplatesCard({
  initial,
}: {
  initial: Record<MessageKey, Bodies>;
}) {
  return (
    <details className="rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-medium">
        <MessageSquare className="text-muted-foreground size-4" />
        Client messages
        <span className="text-muted-foreground text-sm font-normal">
          — the WhatsApp messages sent to clients
        </span>
      </summary>
      <div className="flex flex-col gap-8 border-t p-4">
        {KINDS.map((kind) => (
          <section key={kind.key} className="flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-semibold">{kind.title}</h3>
              <p className="text-muted-foreground text-xs">
                {kind.blurb} WhatsApp formatting: <code>*bold*</code>,{" "}
                <code>_italic_</code>.
              </p>
            </div>
            {LANGS.map((l) => (
              <LangEditor
                key={`${kind.key}-${l.code}`}
                msgKey={kind.key}
                lang={l}
                initial={initial[kind.key]?.[l.code] ?? ""}
              />
            ))}
          </section>
        ))}
      </div>
    </details>
  );
}

function LangEditor({
  msgKey,
  lang,
  initial,
}: {
  msgKey: MessageKey;
  lang: { code: MessageLanguage; label: string };
  initial: string;
}) {
  const [body, setBody] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = body.trim() !== saved.trim();
  const id = `msg-${msgKey}-${lang.code}`;

  const save = () =>
    start(async () => {
      const res = await saveMessageTemplate({ key: msgKey, language: lang.code, body });
      if (res.ok) {
        setSaved(body);
        toast.success(`${lang.label} saved.`);
      } else {
        toast.error(res.error);
      }
    });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{lang.label}</Label>
        <Button size="sm" disabled={!dirty || pending || body.trim().length === 0} onClick={save}>
          {pending ? "Saving…" : dirty ? "Save" : "Saved"}
        </Button>
      </div>
      <textarea
        id={id}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={9}
        className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
      />
    </div>
  );
}
