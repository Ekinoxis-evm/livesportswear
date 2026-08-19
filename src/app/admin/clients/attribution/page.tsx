import { Info } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { normalizeStaffId } from "@/lib/shopify-range";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttributionTable } from "@/components/admin/attribution-table";
import { RebuildAttributionButton } from "@/components/admin/rebuild-attribution-button";

type TallyRow = { staff_id: string | null; country_iso: string | null; clients: number };

export default async function ClientsAttributionPage() {
  await requireAdmin();
  const supabase = await createServerClient();

  const [{ data: employeeRows }, { data: tallyData }] = await Promise.all([
    supabase.from("employees").select("id, name, shopify_staff_id, active").order("name"),
    supabase.rpc("client_origin_tallies"),
  ]);
  const employees = employeeRows ?? [];
  const tallies = (tallyData ?? []) as TallyRow[];

  const nameByStaff = new Map(
    employees
      .filter((e) => e.shopify_staff_id)
      .map((e) => [normalizeStaffId(e.shopify_staff_id as string), { name: e.name, active: e.active ?? true }]),
  );

  const countByStaff = new Map<string, number>();
  let attributedTotal = 0;
  for (const t of tallies) {
    const key = t.staff_id ? normalizeStaffId(t.staff_id) : "";
    countByStaff.set(key, (countByStaff.get(key) ?? 0) + Number(t.clients));
    attributedTotal += Number(t.clients);
  }

  const rows = [...countByStaff.entries()]
    .map(([staff, clients]) => {
      const emp = staff ? nameByStaff.get(staff) : undefined;
      return {
        staff,
        name: staff ? (emp?.name ?? "former staff") : "no staff on order",
        active: emp?.active ?? null,
        mapped: !!emp,
        clients,
      };
    })
    .sort((a, b) => b.clients - a.clients);
  const namedTotal = rows.filter((r) => r.mapped).reduce((a, r) => a + r.clients, 0);
  const unnamedTotal = attributedTotal - namedTotal;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Who brought each client in — the one thing Shopify doesn&apos;t record,
          taken from each client&apos;s FIRST in-store order. Returns, draft and
          test orders are ignored; cash sales with no customer belong to nobody.
        </p>
        <RebuildAttributionButton />
      </div>

      <Alert>
        <Info className="size-4" />
        <AlertTitle>How this attribution works</AlertTitle>
        <AlertDescription>
          <p>
            A client belongs to whoever sold them their{" "}
            <strong className="text-foreground">first</strong> in-store order.
            Mapping a rep to their Shopify staff account later re-attributes all
            their history automatically — no rebuild needed.
          </p>
          {attributedTotal > 0 && (
            <p className="tabular-nums">
              <strong className="text-foreground">
                {attributedTotal.toLocaleString()}
              </strong>{" "}
              clients attributed
              {unnamedTotal > 0 && (
                <>
                  {" · "}
                  <strong className="text-foreground">
                    {unnamedTotal.toLocaleString()}
                  </strong>{" "}
                  sit on staff accounts not linked to an employee — link them on
                  the employee pages
                </>
              )}
              .
            </p>
          )}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clients brought in, by rep</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No attribution yet — hit &ldquo;Rebuild attribution&rdquo; to sweep
              your Shopify order history.
            </p>
          ) : (
            <AttributionTable rows={rows} attributedTotal={attributedTotal} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
