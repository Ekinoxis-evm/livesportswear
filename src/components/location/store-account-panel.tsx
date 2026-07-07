"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MonitorSmartphone } from "lucide-react";
import { createStoreAccount, resetStorePassword } from "@/server/store-accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/shared/copy-button";

/**
 * Admin block: the shared store-screen login for one location. The generated
 * password is shown once — copy it to the store device.
 */
export function StoreAccountPanel({ locationId }: { locationId: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    start(async () => {
      const res = await createStoreAccount({ location_id: locationId, email });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't create the account.");
        return;
      }
      setPassword(res.data!.password);
      toast.success("Store account created.");
    });
  }

  function reset() {
    start(async () => {
      const res = await resetStorePassword({ email });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't reset the password.");
        return;
      }
      setPassword(res.data!.password);
      toast.success("Password reset.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <MonitorSmartphone className="size-4" /> Store screen login
      </span>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`store-email-${locationId}`}>Account email</Label>
          <Input
            id={`store-email-${locationId}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="lincoln-screen@liveactivewear.com"
            className="w-72"
          />
        </div>
        <Button size="sm" disabled={pending || !email} onClick={create}>
          Create account
        </Button>
        <Button size="sm" variant="outline" disabled={pending || !email} onClick={reset}>
          Reset password
        </Button>
      </div>
      {password && (
        <div className="bg-muted flex items-center gap-2 rounded-md p-3 text-sm">
          <span className="font-mono">{password}</span>
          <CopyButton value={password} />
          <span className="text-muted-foreground text-xs">
            Shown once — sign in on the store device now.
          </span>
        </div>
      )}
    </div>
  );
}
