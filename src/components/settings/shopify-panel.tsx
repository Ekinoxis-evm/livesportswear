"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  syncMonthlySales,
  listShopifyStaff,
  setShopifyStaffId,
} from "@/server/shopify";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Emp = { id: string; name: string; shopify_staff_id: string | null };
type Staff = { id: string; name: string; email: string | null };

export function ShopifyPanel({
  configured,
  employees,
}: {
  configured: boolean;
  employees: Emp[];
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [staff, setStaff] = useState<Staff[] | null>(null);

  if (!configured) {
    return (
      <div className="text-muted-foreground flex flex-col gap-2 text-sm">
        <p>
          Not connected yet. Add <code>SHOPIFY_STORE_DOMAIN</code>,{" "}
          <code>SHOPIFY_CLIENT_ID</code> and <code>SHOPIFY_CLIENT_SECRET</code>{" "}
          in Vercel (Dev Dashboard app in the store&apos;s organization, Admin
          API scopes <code>read_orders</code>, <code>read_users</code>), then
          redeploy. Sales then sync automatically each day, and you can map
          staff here.
        </p>
      </div>
    );
  }

  async function sync() {
    setSyncing(true);
    const res = await syncMonthlySales();
    setSyncing(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      `Synced ${res.updated} employee${res.updated === 1 ? "" : "s"}` +
        (res.unmatched ? ` · ${res.unmatched} unmatched staff` : ""),
    );
    router.refresh();
  }

  async function loadStaff() {
    setLoadingStaff(true);
    const res = await listShopifyStaff();
    setLoadingStaff(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setStaff(res.data!.staff);
  }

  async function assign(employeeId: string, value: string) {
    const res = await setShopifyStaffId(
      employeeId,
      value === "none" ? null : value,
    );
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Mapping saved.");
    router.refresh();
  }

  const items: Record<string, string> = {
    none: "Unmapped",
    ...Object.fromEntries(
      (staff ?? []).map((s) => [s.id, s.email ? `${s.name} (${s.email})` : s.name]),
    ),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={sync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync this month"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={loadStaff}
          disabled={loadingStaff}
        >
          {loadingStaff ? "Loading…" : staff ? "Reload staff" : "Map staff"}
        </Button>
      </div>

      {staff && (
        <ul className="flex flex-col gap-2">
          {employees.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span className="text-sm">{e.name}</span>
              <Select
                items={items}
                value={e.shopify_staff_id ?? "none"}
                onValueChange={(v) => assign(e.id, v ?? "none")}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Unmapped" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unmapped</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.email ? `${s.name} (${s.email})` : s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">
        Unmapped staff also auto-match by email during sync.
      </p>
    </div>
  );
}
