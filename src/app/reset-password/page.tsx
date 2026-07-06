"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createBrowserClient } from "@/lib/supabase/browser";
import { clearMyStoredCredential } from "@/server/profile";
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

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    // Arriving from the recovery link sets a temporary session.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    setPending(true);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Employees: drop the admin-stored temp credential (no-op for admins).
    await clearMyStoredCredential().catch(() => undefined);
    toast.success("Password updated.");
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Set a new password</CardTitle>
          <CardDescription>Choose a password you&apos;ll remember.</CardDescription>
        </CardHeader>
        <CardContent>
          {ready ? (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Update password"}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-muted-foreground text-sm">
                Open this page from the reset link in your email. The link may
                have expired.
              </p>
              <Link href="/forgot-password" className="text-primary text-sm underline">
                Request a new link
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
