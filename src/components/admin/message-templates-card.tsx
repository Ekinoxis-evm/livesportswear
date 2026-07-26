"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { saveMessageTemplate } from "@/server/message-templates";
import type { MessageLanguage } from "@/lib/message-languages";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const LANGS: { code: MessageLanguage; label: string }[] = [
  { code: "pt", label: "🇧🇷 Portuguese" },
  { code: "en", label: "🇺🇸 English" },
  { code: "es", label: "🇪🇸 Spanish" },
];

/**
 * Admin editor for the client thank-you messages — one body per language, sent
 * from the kiosk over WhatsApp after a sale. Collapsed by default (`<details>`).
 * `{name}` fills the client's first name; the items they bought are appended
 * automatically, so no product token is needed.
 */
export function MessageTemplatesCard({
  initial,
}: {
  initial: Record<MessageLanguage, string>;
}) {
  return (
    <details className="rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-medium">
        <MessageSquare className="text-muted-foreground size-4" />
        Client messages
        <span className="text-muted-foreground text-sm font-normal">
          — the thank-you sent over WhatsApp after a sale
        </span>
      </summary>
      <div className="flex flex-col gap-5 border-t p-4">
        <p className="text-muted-foreground text-xs">
          <code>{"{name}"}</code> is replaced with the client&apos;s first name;
          the products they just bought are appended automatically. WhatsApp
          formatting: <code>*bold*</code>, <code>_italic_</code>.
        </p>
        {LANGS.map((l) => (
          <LangEditor key={l.code} lang={l} initial={initial[l.code] ?? ""} />
        ))}
      </div>
    </details>
  );
}

function LangEditor({
  lang,
  initial,
}: {
  lang: { code: MessageLanguage; label: string };
  initial: string;
}) {
  const [body, setBody] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = body.trim() !== saved.trim();

  const save = () =>
    start(async () => {
      const res = await saveMessageTemplate({ language: lang.code, body });
      if (res.ok) {
        setSaved(body);
        toast.success(`${lang.label} message saved.`);
      } else {
        toast.error(res.error);
      }
    });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={`msg-${lang.code}`}>{lang.label}</Label>
        <Button size="sm" disabled={!dirty || pending || body.trim().length === 0} onClick={save}>
          {pending ? "Saving…" : dirty ? "Save" : "Saved"}
        </Button>
      </div>
      <textarea
        id={`msg-${lang.code}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={10}
        className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
      />
    </div>
  );
}
