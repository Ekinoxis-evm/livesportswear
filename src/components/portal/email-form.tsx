"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AtSign } from "lucide-react";
import { changeOwnEmail } from "@/server/profile";
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

export function EmailForm({ email }: { email: string }) {
  const router = useRouter();
  const [value, setValue] = useState(email);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await changeOwnEmail(value);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't change your email.");
        return;
      }
      toast.success("Email updated. Use it next time you sign in.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          <AtSign className="size-4" /> Login email
        </CardTitle>
        <CardDescription>
          The email you sign in with and receive your schedule at. Changing it
          also renews your schedule links below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex items-end gap-2" noValidate>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending || value.trim().toLowerCase() === email}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
