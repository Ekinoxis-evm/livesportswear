import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "date-fns-tz";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StartCountButton } from "@/components/inventory/start-count-button";

export default async function InventoryPage() {
  await requireAdmin();
  const supabase = await createServerClient();

  // RLS scopes both queries to the admin's locations.
  const [{ data: locations }, { data: counts }] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name, timezone")
      .eq("active", true)
      .order("name"),
    supabase
      .from("inventory_counts")
      .select("id, location_id, status, note, started_at, finalized_at, counted_units, expected_units")
      .order("started_at", { ascending: false })
      .limit(50),
  ]);

  const locs = locations ?? [];
  const locOf = new Map(locs.map((l) => [l.id, l]));
  const openByLocation = new Set(
    (counts ?? []).filter((c) => c.status === "open").map((c) => c.location_id),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Physical counts — scan every barcode on the floor, then compare
            against what Shopify expects.
          </p>
        </div>
        <StartCountButton
          locations={locs.map((l) => ({
            id: l.id,
            name: l.name,
            hasOpen: openByLocation.has(l.id),
          }))}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          {(counts ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No counts yet — start one and begin scanning.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Expected
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(counts ?? []).map((c) => {
                  const loc = locOf.get(c.location_id);
                  const tz = loc?.timezone ?? "UTC";
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {loc?.name ?? "—"}
                        {c.note && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            {c.note}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatInTimeZone(new Date(c.started_at), tz, "MMM d · HH:mm")}
                      </TableCell>
                      <TableCell>
                        {c.status === "open" ? (
                          <Badge>counting</Badge>
                        ) : (
                          <Badge variant="secondary">final</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.counted_units ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {c.expected_units ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/admin/inventory/${c.id}`}
                          className="text-primary text-sm underline-offset-4 hover:underline"
                        >
                          {c.status === "open" ? "Continue" : "Report"}
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
