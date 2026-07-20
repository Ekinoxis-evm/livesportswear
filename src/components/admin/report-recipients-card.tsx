"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Send, X } from "lucide-react";
import {
  addReportRecipient,
  removeReportRecipient,
  sendTestReport,
} from "@/server/report-recipients";
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

export function ReportRecipientsCard({
  locationId,
  locationName,
  recipients,
}: {
  locationId: string;
  locationName: string;
  recipients: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  function onAdd(values: FormValues) {
    start(async () => {
      const res = await addReportRecipient({ location_id: locationId, email: values.email });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Recipient added.");
      reset({ email: "" });
      router.refresh();
    });
  }

  function remove(email: string) {
    setBusyEmail(email);
    start(async () => {
      const res = await removeReportRecipient({ location_id: locationId, email });
      setBusyEmail(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Recipient removed.");
      router.refresh();
    });
  }

  function sendTest() {
    start(async () => {
      const res = await sendTestReport({ location_id: locationId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Test report sent.");
    });
  }

  const hasRecipients = recipients.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily report recipients</CardTitle>
        <CardDescription>
          Who gets {locationName}&apos;s Close-Day report. Add or remove anyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          {recipients.map((email) => (
            <span
              key={email}
              className="bg-secondary text-secondary-foreground inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1 text-xs"
            >
              {email}
              <button
                type="button"
                aria-label={`Remove ${email}`}
                disabled={pending && busyEmail === email}
                onClick={() => remove(email)}
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
            Sends today&apos;s report now, marked <span className="font-medium">[TEST]</span>,
            without closing the day.
          </p>
          <Button onClick={sendTest} disabled={pending || !hasRecipients}>
            <Send className="size-4" />
            Send test report
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
