"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Send, X } from "lucide-react";
import type { ActionResult } from "@/server/shared";
import type { CloseDayDraft } from "@/server/conversion-core";
import { ReportWizard } from "@/components/shared/report-wizard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const formSchema = z.object({ email: z.string().trim().email("Enter a valid email.") });
type FormValues = z.infer<typeof formSchema>;

/**
 * Presentational recipient editor shared by the admin and kiosk report cards.
 * The three actions are passed in so each surface can bind its own server
 * action (admin: location-scoped by requireAdmin; kiosk: the store JWT's
 * location). Optimistic local state so add/remove reflect instantly.
 */
export function RecipientsManager({
  description,
  recipients,
  add,
  remove,
  sendTest,
  loadDraft,
}: {
  description: string;
  recipients: string[];
  add: (email: string) => Promise<ActionResult>;
  remove: (email: string) => Promise<ActionResult>;
  sendTest: (recipients: string[]) => Promise<ActionResult<{ sentTo: number }>>;
  /** Supplied on every real surface: makes the button open the review wizard
   *  (recipients → numbers → send) instead of firing a send immediately. */
  loadDraft: () => Promise<ActionResult<CloseDayDraft>>;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [items, setItems] = useState<string[]>(recipients);
  const [syncedFrom, setSyncedFrom] = useState<string[]>(recipients);
  if (syncedFrom !== recipients) {
    setSyncedFrom(recipients);
    setItems(recipients);
  }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  function onAdd(values: FormValues) {
    const email = values.email.trim().toLowerCase();
    start(async () => {
      const res = await add(email);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setItems((prev) => (prev.includes(email) ? prev : [...prev, email]));
      toast.success("Recipient added.");
      reset({ email: "" });
      router.refresh();
    });
  }

  function onRemove(email: string) {
    setBusyEmail(email);
    start(async () => {
      const res = await remove(email);
      setBusyEmail(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setItems((prev) => prev.filter((e) => e !== email));
      toast.success("Recipient removed.");
      router.refresh();
    });
  }


  const hasRecipients = items.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily report recipients</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          {items.map((email) => (
            <span
              key={email}
              className="bg-secondary text-secondary-foreground inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1 text-xs"
            >
              {email}
              <button
                type="button"
                aria-label={`Remove ${email}`}
                disabled={pending && busyEmail === email}
                onClick={() => onRemove(email)}
                className="hover:bg-foreground/10 rounded-full p-0.5 disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {!hasRecipients && (
            <span className="text-muted-foreground text-sm">
              No recipients yet — add one so the report can be sent.
            </span>
          )}
        </div>

        <form
          onSubmit={handleSubmit(onAdd)}
          className="flex flex-col gap-1.5 sm:flex-row sm:items-start"
        >
          <div className="flex-1">
            <Label htmlFor="report-email" className="sr-only">
              Recipient email
            </Label>
            <Input
              id="report-email"
              type="email"
              placeholder="owner@example.com"
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-destructive mt-1 text-xs">{errors.email.message}</p>
            )}
          </div>
          <Button type="submit" variant="outline" disabled={pending || isSubmitting}>
            <Plus className="size-4" />
            Add
          </Button>
        </form>

        <div className="flex items-center justify-between border-t pt-3">
          <p className="text-muted-foreground text-xs">
            Review the recipients and the numbers, then send today&apos;s report
            marked <span className="font-medium">[TEST]</span> — the day stays open.
          </p>
          <Button onClick={() => setWizardOpen(true)} disabled={pending || !hasRecipients}>
            <Send className="size-4" />
            Send test report
          </Button>
        </div>
      </CardContent>

      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-md flex-col">
          <DialogHeader>
            <DialogTitle>Send a test report</DialogTitle>
            <DialogDescription>
              The same report marked [TEST]. Nothing is recorded.
            </DialogDescription>
          </DialogHeader>
          {wizardOpen && (
            <ReportWizard
              mode="test"
              loadDraft={loadDraft}
              send={({ recipients: only }) => sendTest(only)}
              onDone={() => setWizardOpen(false)}
              onCancel={() => setWizardOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
