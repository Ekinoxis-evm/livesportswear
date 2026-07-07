"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { resendScheduleEmail } from "@/server/schedules";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ResendEmailMenu({
  scheduleId,
  recipients,
}: {
  scheduleId: string;
  recipients: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();

  if (recipients.length === 0) return null;

  function send(emp: { id: string; name: string }) {
    start(async () => {
      const res = await resendScheduleEmail(scheduleId, emp.id);
      if (!res.ok) {
        toast.error(res.error ?? "The email couldn't be sent.");
        return;
      }
      toast.success(`Schedule sent to ${emp.name}.`);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" disabled={pending}>
            <Send className="mr-1 size-4" /> Resend email
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
        {recipients.map((e) => (
          <DropdownMenuItem key={e.id} onClick={() => send(e)}>
            {e.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
