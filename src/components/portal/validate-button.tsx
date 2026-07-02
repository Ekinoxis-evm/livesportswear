"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { validateAttendance } from "@/server/floor";
import { Button } from "@/components/ui/button";

export function ValidateButton({ token, label }: { token: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function confirm() {
    start(async () => {
      const res = await validateAttendance(token);
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success("Validated. Thanks!");
      router.push("/portal/today");
    });
  }

  return (
    <Button size="lg" className="w-full" disabled={pending} onClick={confirm}>
      <CheckCircle2 className="mr-1.5 size-4" /> {label}
    </Button>
  );
}
