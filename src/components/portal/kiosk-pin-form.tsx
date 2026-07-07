"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { setOwnKioskPin } from "@/server/profile";
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

export function KioskPinForm({ hasPin }: { hasPin: boolean }) {
  const [pin, setPin] = useState("");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await setOwnKioskPin(pin);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't save your PIN.");
        return;
      }
      toast.success("PIN saved.");
      setPin("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          <KeyRound className="size-4" /> Store screen PIN
        </CardTitle>
        <CardDescription>
          Confirms it&apos;s you when marking entry or exit on the store screen.
          {hasPin ? " A PIN is set — saving replaces it." : " No PIN set yet."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="kiosk-pin">4-digit PIN</Label>
          <Input
            id="kiosk-pin"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="w-28 text-center text-lg tracking-[0.4em]"
            placeholder="••••"
          />
        </div>
        <Button size="sm" disabled={pending || pin.length !== 4} onClick={save}>
          {pending ? "Saving…" : "Save PIN"}
        </Button>
      </CardContent>
    </Card>
  );
}
