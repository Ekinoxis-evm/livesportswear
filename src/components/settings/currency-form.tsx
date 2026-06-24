"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setCurrency } from "@/server/commission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CurrencyForm({ currency }: { currency: string }) {
  const router = useRouter();
  const [value, setValue] = useState(currency);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await setCurrency({ currency: value });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Currency saved.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="currency">Currency (ISO code)</Label>
        <Input
          id="currency"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          className="w-28"
          maxLength={8}
          placeholder="USD"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        Save
      </Button>
    </form>
  );
}
