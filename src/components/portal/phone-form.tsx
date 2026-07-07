"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateOwnPhone } from "@/server/profile";
import { DIAL_CODES, DIAL_CODE_ITEMS, splitPhone, joinPhone } from "@/lib/dial-codes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PhoneForm({ phone }: { phone: string | null }) {
  const router = useRouter();
  const initial = splitPhone(phone ?? undefined);
  const [dialCode, setDialCode] = useState(initial.dialCode);
  const [number, setNumber] = useState(initial.number);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await updateOwnPhone(number ? joinPhone(dialCode, number) : "");
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't save your phone.");
        return;
      }
      toast.success("Phone updated.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <Label htmlFor="phone">Phone</Label>
      <div className="flex gap-2">
        <Select
          items={DIAL_CODE_ITEMS}
          value={dialCode}
          onValueChange={(v) => setDialCode(v ?? dialCode)}
        >
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue placeholder="Code" />
          </SelectTrigger>
          <SelectContent>
            {DIAL_CODES.map((d) => (
              <SelectItem key={d.code} value={d.code}>
                {d.flag} {d.code} {d.country}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id="phone"
          inputMode="tel"
          placeholder="300 123 4567"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
