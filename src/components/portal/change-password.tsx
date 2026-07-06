"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { changeOwnPassword } from "@/server/profile";
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

export function ChangePasswordCard() {
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    start(async () => {
      const res = await changeOwnPassword(password);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't change the password.");
        return;
      }
      setPassword("");
      toast.success("Password changed.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          <KeyRound className="size-4" /> Change password
        </CardTitle>
        <CardDescription>
          If you signed in with a temporary password, set your own here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex items-end gap-2" noValidate>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
