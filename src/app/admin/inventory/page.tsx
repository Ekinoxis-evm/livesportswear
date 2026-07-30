import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "date-fns-tz";
import { ClipboardCheck, PackagePlus } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { InventoryFunnel } from "@/components/inventory/inventory-funnel";
import { SessionsTable } from "@/components/inventory/sessions-table";
import { StartCountButton } from "@/components/inventory/start-count-button";
import { StartReceivingButton } from "@/components/inventory/start-receiving-button";

export default async function InventoryPage() {
  await requireAdmin();
  const supabase = await createServerClient();

  // RLS scopes both queries to the admin's locations.
  const [{ data: locations }, { data: counts }, { data: bookRows }] =
    await Promise.all([
      supabase
        .from("locations")
        .select("id, name, timezone")
        .eq("active", true)
        .order("name"),
      supabase
        .from("inventory_counts")
        .select("id, location_id, status, kind, note, started_at, finalized_at, counted_units, expected_units")
        .order("started_at", { ascending: false })
        .limit(50),
      supabase.from("store_inventory").select("location_id, qty, counted_at"),
    ]);

  const locs = locations ?? [];
  const bookByLoc = new Map<
    string,
    { items: number; units: number; lastCounted: string }
  >();
  for (const r of bookRows ?? []) {
    const cur = bookByLoc.get(r.location_id) ?? {
      items: 0,
      units: 0,
      lastCounted: r.counted_at,
    };
    cur.items++;
    cur.units += r.qty;
    if (r.counted_at > cur.lastCounted) cur.lastCounted = r.counted_at;
    bookByLoc.set(r.location_id, cur);
  }
  const locOf = new Map(locs.map((l) => [l.id, l]));
  const openCountByLocation = new Set(
    (counts ?? [])
      .filter((c) => c.status === "open" && c.kind !== "restock")
      .map((c) => c.location_id),
  );
  const openRestockByLocation = new Set(
    (counts ?? [])
      .filter((c) => c.status === "open" && c.kind === "restock")
      .map((c) => c.location_id),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            One flow, start to finish: <strong>count</strong> what&apos;s in the
            store, it lands in the <strong>book</strong>, then you{" "}
            <strong>push</strong> the corrections to Shopify. Start below.
          </p>
        </div>
        <InventoryFunnel current="count" locationId={locs[0]?.id} />
      </div>

      {/* The mental model that was missing: these two jobs do opposite things,
          so they get their own cards, colours and a plain "when to use" line. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-primary/30 flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="text-primary size-5 shrink-0" />
            <span className="font-semibold">Count what&apos;s on the floor</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Scan everything on the racks. At finish, Shopify is <em>set</em> to
            exactly what you counted — anything not scanned goes to zero. Use for
            a stock-take.
          </p>
          <div className="mt-auto">
            <StartCountButton
              locations={locs.map((l) => ({
                id: l.id,
                name: l.name,
                hasOpen: openCountByLocation.has(l.id),
              }))}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-3 border-amber-500/30 p-5">
          <div className="flex items-center gap-2">
            <PackagePlus className="size-5 shrink-0 text-amber-600 dark:text-amber-500" />
            <span className="font-semibold">Receive a shipment</span>
          </div>
          <p className="text-muted-foreground text-sm">
            A delivery arrived (invoice / packing list). Verify what came in and
            it&apos;s <em>added on top</em> of current on-hand — nothing is zeroed.
            Use when new stock lands.
          </p>
          <div className="mt-auto">
            <StartReceivingButton
              locations={locs.map((l) => ({
                id: l.id,
                name: l.name,
                hasOpen: openRestockByLocation.has(l.id),
              }))}
            />
          </div>
        </Card>
      </div>

      {/* The book: our counted truth per store */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {locs.map((l) => {
          const book = bookByLoc.get(l.id);
          return (
            <Card key={l.id} className="hover:border-primary h-full transition-colors">
              <CardContent className="flex h-full flex-col gap-1 pt-6">
                <Link
                  href={`/admin/inventory/book?location=${l.id}`}
                  className="flex flex-col gap-1"
                >
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">
                    Inventory book · {l.name}
                  </span>
                  {book ? (
                    <>
                      <span className="text-2xl font-semibold tabular-nums">
                        {book.units}{" "}
                        <span className="text-muted-foreground text-sm font-normal">
                          units on hand
                        </span>
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {book.items} items · last count{" "}
                        {formatInTimeZone(new Date(book.lastCounted), l.timezone, "MMM d")}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      Finalize a count to build the book.
                    </span>
                  )}
                </Link>
                {book && (
                  <Link
                    href={`/admin/inventory/push?location=${l.id}`}
                    className="text-primary mt-auto pt-2 text-xs font-medium hover:underline"
                  >
                    Push to Shopify →
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-6">
          {(counts ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No counts yet — start one and begin scanning.
            </p>
          ) : (
            <SessionsTable
              rows={(counts ?? []).map((c) => {
                const loc = locOf.get(c.location_id);
                const tz = loc?.timezone ?? "UTC";
                return {
                  id: c.id,
                  storeName: loc?.name ?? "—",
                  note: c.note,
                  restock: c.kind === "restock",
                  startedAt: c.started_at,
                  startedLabel: formatInTimeZone(new Date(c.started_at), tz, "MMM d · HH:mm"),
                  status: c.status,
                  countedUnits: c.counted_units,
                  expectedUnits: c.expected_units,
                };
              })}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
