"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveMessageTemplate } from "@/server/message-templates";
import type { MessageKey, MessageLanguage } from "@/lib/message-languages";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Bodies = Record<MessageLanguage, string>;

const LANGS: { code: MessageLanguage; label: string }[] = [
  { code: "pt", label: "🇧🇷 Portuguese" },
  { code: "en", label: "🇺🇸 English" },
  { code: "es", label: "🇪🇸 Spanish" },
];

// One entry per message kind — adding a new message type is a single line here
// (plus the key in MESSAGE_KEYS + a seed migration).
const KINDS: { key: MessageKey; title: string; blurb: string; tokens: string }[] = [
  {
    key: "thank_you",
    title: "Thank-you",
    blurb: "Sent right after a purchase.",
    tokens: "{name} · the items bought are appended automatically",
  },
  {
    key: "hello",
    title: "Hello",
    blurb: "A greeting you can send any time.",
    tokens: "{name} · {last_product} (their last purchase)",
  },
];

/**
 * Manage the client WhatsApp messages: a sub-tab per kind, each with the three
 * language bodies. Built to scale — new message kinds slot into KINDS.
 */
export function MessageManager({ initial }: { initial: Record<MessageKey, Bodies> }) {
  const [active, setActive] = useState<MessageKey>("thank_you");
  const kind = KINDS.find((k) => k.key === active) ?? KINDS[0];

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex gap-1">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setActive(k.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              active === k.key
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {k.title}
          </button>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{kind.title}</CardTitle>
          <CardDescription>
            {kind.blurb} Tokens: <code>{kind.tokens}</code>. WhatsApp formatting:{" "}
            <code>*bold*</code>, <code>_italic_</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {LANGS.map((l) => (
            <LangEditor
              key={`${kind.key}-${l.code}`}
              msgKey={kind.key}
              lang={l}
              initial={initial[kind.key]?.[l.code] ?? ""}
            />
          ))}
        </CardContent>
      </Card>
    </div>
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
