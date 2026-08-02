"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import {
  inviteAdmin,
  removeAdmin,
  resetAdminPassword,
  type AdminRow,
} from "@/server/admins";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/shared/copy-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Location = { id: string; name: string };
type Issued = { password: string; email: string; emailed: boolean };

export function AdminsPanel({
  admins,
  locations,
}: {
  admins: AdminRow[];
  locations: Location[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [master, setMaster] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const nameOf = new Map(locations.map((l) => [l.id, l.name]));

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  function toggleReveal(id: string) {
    setRevealed((r) => {
      const next = new Set(r);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function invite() {
    start(async () => {
      const res = await inviteAdmin({ email, master, locationIds: master ? [] : picked });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't invite admin.");
        return;
      }
      setIssued(res.data ?? null);
      setEmail("");
      setMaster(false);
      setPicked([]);
      router.refresh();
    });
  }

  function reset(userId: string) {
    start(async () => {
      const res = await resetAdminPassword(userId);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't reset the password.");
        return;
      }
      setIssued(res.data ?? null);
      router.refresh();
    });
  }

  function remove(userId: string) {
    start(async () => {
      const res = await removeAdmin(userId);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't remove admin.");
        return;
      }
      toast.success("Admin removed.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-email">Invite an admin</Label>
          <Input
            id="admin-email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <label className="flex w-fit items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={master}
            onChange={(e) => setMaster(e.target.checked)}
            className="size-4"
          />
          Master admin <span className="text-muted-foreground">(all stores)</span>
        </label>

        {!master && (
          <div className="flex flex-wrap gap-1.5">
            {locations.map((l) => (
              <Button
                key={l.id}
                type="button"
                size="sm"
                variant={picked.includes(l.id) ? "default" : "outline"}
                onClick={() => toggle(l.id)}
              >
                {l.name}
              </Button>
            ))}
          </div>
        )}
        <div>
          <Button
            size="sm"
            disabled={pending || !email || (!master && picked.length === 0)}
            onClick={invite}
          >
            {pending ? "Creating…" : master ? "Create master admin" : "Create admin access"}
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(issued)} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Admin password</DialogTitle>
            <DialogDescription>
              {issued?.emailed
                ? `Emailed to ${issued.email}. You can also hand it over directly — it's saved below and copyable from the list too:`
                : `The email couldn't be sent — hand it over directly; it's saved below and copyable from the list:`}
            </DialogDescription>
          </DialogHeader>
          {issued && (
            <div className="bg-muted flex items-center justify-between gap-2 rounded-md border p-3">
              <code className="text-base font-semibold tracking-wide">{issued.password}</code>
              <CopyButton value={issued.password} label="Copy" />
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button>Done</Button>} />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ul className="flex flex-col divide-y border-t">
        {admins.map((a) => (
          <li key={a.userId} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">{a.email}</span>
              <span className="text-muted-foreground text-xs">
                {a.isMaster
                  ? "Master · all stores"
                  : a.locationIds.length
                    ? a.locationIds.map((id) => nameOf.get(id) ?? "—").join(", ")
                    : "No stores assigned"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {a.tempPassword && (
                <div className="bg-muted flex items-center gap-1 rounded-md border px-2 py-1">
                  <code className="text-xs tabular-nums">
                    {revealed.has(a.userId) ? a.tempPassword : "••••••••"}
                  </code>
                  <button
                    type="button"
                    aria-label={revealed.has(a.userId) ? "Hide password" : "Reveal password"}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => toggleReveal(a.userId)}
                  >
                    {revealed.has(a.userId) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                  <CopyButton value={a.tempPassword} />
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => reset(a.userId)}
              >
                <KeyRound className="mr-1 size-3.5" /> Reset
              </Button>
              {a.isMaster ? (
                <Badge variant="secondary">Master</Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive"
                  aria-label="Remove admin"
                  disabled={pending}
                  onClick={() => remove(a.userId)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
