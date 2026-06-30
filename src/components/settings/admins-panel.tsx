"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { inviteAdmin, removeAdmin, type AdminRow } from "@/server/admins";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Location = { id: string; name: string };

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
  const [picked, setPicked] = useState<string[]>([]);
  const nameOf = new Map(locations.map((l) => [l.id, l.name]));

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function invite() {
    start(async () => {
      const res = await inviteAdmin({ email, locationIds: picked });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't invite admin.");
        return;
      }
      toast.success("Admin invited.");
      setEmail("");
      setPicked([]);
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
          <Label htmlFor="admin-email">Invite a store admin</Label>
          <Input
            id="admin-email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
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
        <div>
          <Button
            size="sm"
            disabled={pending || !email || picked.length === 0}
            onClick={invite}
          >
            {pending ? "Inviting…" : "Send admin invite"}
          </Button>
        </div>
      </div>

      <ul className="flex flex-col divide-y border-t">
        {admins.map((a) => (
          <li key={a.userId} className="flex items-center justify-between gap-3 py-2">
            <div className="flex flex-col">
              <span className="text-sm">{a.email}</span>
              <span className="text-muted-foreground text-xs">
                {a.isMaster
                  ? "Master · all stores"
                  : a.locationIds.length
                    ? a.locationIds.map((id) => nameOf.get(id) ?? "—").join(", ")
                    : "No stores assigned"}
              </span>
            </div>
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
          </li>
        ))}
      </ul>
    </div>
  );
}
