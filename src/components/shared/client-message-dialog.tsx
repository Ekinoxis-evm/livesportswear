"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Loader2, Send } from "lucide-react";
import type { ActionResult } from "@/server/shared";
import { MESSAGE_KEYS, type MessageKey, type MessageLanguage } from "@/lib/message-languages";
import { cn } from "@/lib/utils";
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
  { code: "pt", label: "🇧🇷 Português" },
  { code: "en", label: "🇺🇸 English" },
  { code: "es", label: "🇪🇸 Español" },
];
const STEP_TITLES = ["Message type", "Language", "Review & send"];

/**
 * A 3-step wizard to message a client on WhatsApp: pick the type, pick the
 * language, then REVIEW the built message before opening WhatsApp. Shared by the
 * kiosk and portal client lists — the surface supplies `getLink`, which resolves
 * the template + phone + signature server-side and returns the wa.me URL + the
 * filled message text (for the preview).
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
  }) => Promise<ActionResult<{ url: string; text: string }>>;
}) {
  const [step, setStep] = useState(0);
  const [key, setKey] = useState<MessageKey | null>(null);
  const [loading, setLoading] = useState<MessageLanguage | null>(null);
  const [result, setResult] = useState<{ url: string; text: string } | null>(null);

  const reset = () => {
    setStep(0);
    setKey(null);
    setLoading(null);
    setResult(null);
  };

  const pickType = (k: MessageKey) => {
    setKey(k);
    setResult(null);
    setStep(1);
  };

  const pickLanguage = (language: MessageLanguage) => {
    if (!client || !key) return;
    setLoading(language);
    void getLink({ customerId: client.customerId, key, language }).then((res) => {
      setLoading(null);
      if (res.ok && res.data) {
        setResult(res.data);
        setStep(2);
      } else if (!res.ok) {
        toast.error(res.error);
      }
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
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>Message {client?.name}</DialogTitle>
          <DialogDescription>
            Step {step + 1} of 3 · {STEP_TITLES[step]}
          </DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex gap-1.5">
          {STEP_TITLES.map((t, i) => (
            <span
              key={t}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i <= step ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Step 1 — type */}
          {step === 0 && (
            <div className="flex flex-col gap-2">
              {MESSAGE_KEYS.map((k) => (
                <Button
                  key={k}
                  size="lg"
                  variant="outline"
                  className="h-16 justify-start text-base"
                  onClick={() => pickType(k)}
                >
                  {KIND_LABEL[k]}
                </Button>
              ))}
            </div>
          )}

          {/* Step 2 — language */}
          {step === 1 && (
            <div className="flex flex-col gap-2">
              {LANGS.map((l) => (
                <Button
                  key={l.code}
                  size="lg"
                  variant="outline"
                  className="h-16 justify-start text-base"
                  disabled={loading !== null}
                  onClick={() => pickLanguage(l.code)}
                >
                  {loading === l.code ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : null}
                  {l.label}
                </Button>
              ))}
            </div>
          )}

          {/* Step 3 — review */}
          {step === 2 && result && (
            <div className="flex flex-col gap-3">
              <div className="bg-muted/40 max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-lg border p-3 text-sm">
                {result.text}
              </div>
              <a
                href={result.url}
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
            </div>
          )}
        </div>

        {step > 0 && (
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={loading !== null}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ChevronLeft className="size-4" /> Back
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
