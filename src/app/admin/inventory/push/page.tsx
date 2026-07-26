import Link from "next/link";
import { ChevronLeft, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { fetchAppAccessScopes } from "@/lib/shopify";
import { pushTotals, buildPushCsv, type PushCsvRow } from "@/lib/inventory-push";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InventoryFunnel } from "@/components/inventory/inventory-funnel";
import { DownloadCsvButton } from "@/components/inventory/download-csv-button";
import { BuildPushDraftButton } from "@/components/inventory/build-push-draft-button";
import { PushItemsTable } from "@/components/inventory/push-items-table";
import { DiscardDraftDialog } from "@/components/inventory/discard-draft-dialog";
import { ApplyDraftDialog } from "@/components/inventory/apply-draft-dialog";

export default async function InventoryPushPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createServerClient();

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, timezone")
    .eq("active", true)
    .order("name");
  const locations = locationRows ?? [];
  if (locations.length === 0) {
    return <p className="text-muted-foreground text-sm">No active stores.</p>;
  }
  const location = locations.find((l) => l.id === sp.location) ?? locations[0];

  const canWrite = isShopifyConfigured()
    ? await fetchAppAccessScopes()
        .then((scopes) => scopes.includes("write_inventory"))
        .catch(() => null)
    : false;

  const { data: draft } = await supabase
    .from("shopify_push_drafts")
    .select("*")
    .eq("location_id", location.id)
    .eq("status", "draft")
    .maybeSingle();

  const { data: bookMeta } = await supabase
    .from("store_inventory")
    .select("qty, counted_at")
    .eq("location_id", location.id);
  const bookItems = bookMeta?.length ?? 0;
  const bookUnits = (bookMeta ?? []).reduce((a, r) => a + r.qty, 0);
  const lastCounted = (bookMeta ?? []).reduce<string | null>(
    (max, r) => (max === null || r.counted_at > max ? r.counted_at : max),
    null,
  );
  const stale = !!draft && !!lastCounted && lastCounted > draft.created_at;

  const { data: itemRows } = draft
    ? await supabase
        .from("shopify_push_draft_items")
        .select("*")
        .eq("draft_id", draft.id)
        .order("excluded")
        .order("delta", { ascending: true })
    : { data: null };
  const items = (itemRows ?? []).sort(
    (a, b) =>
      Number(a.excluded) - Number(b.excluded) ||
      Math.abs(b.delta) - Math.abs(a.delta) ||
      a.product_title.localeCompare(b.product_title),
  );
  const totals = pushTotals(items);
  const csv = draft
    ? buildPushCsv(location.name, items as PushCsvRow[])
    : null;

  const disabledReason =
    canWrite === false
      ? "write_inventory scope missing — add it in the Shopify admin to unlock."
      : canWrite === null
        ? "Couldn't reach Shopify to check the app's scopes."
        : stale
          ? "A newer count was finalized — discard and rebuild the draft."
          : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/inventory"
            className="text-muted-foreground flex items-center gap-1 text-sm hover:underline"
          >
            <ChevronLeft className="size-4" /> Inventory
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Push to Shopify · {location.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Three steps, nothing direct: build the correction list as a draft,
            review it, then write it to Shopify.
          </p>
        </div>
        {csv && (
          <DownloadCsvButton
            csv={csv}
            filename={`shopify-push-${location.name.toLowerCase().replace(/\s+/g, "-")}.csv`}
          />
        )}
      </div>

      <InventoryFunnel current="push" locationId={location.id} />

      {locations.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {locations.map((l) => (
            <Link
              key={l.id}
              href={`/admin/inventory/push?location=${l.id}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                l.id === location.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {l.name}
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        {canWrite ? (
          <>
            <ShieldCheck className="size-4 text-emerald-600" />
            <span>
              <Badge variant="outline">write_inventory</Badge> granted — writes
              are unlocked.
            </span>
          </>
        ) : (
          <>
            <ShieldAlert className="size-4 text-amber-600" />
            <span className="text-muted-foreground">
              <Badge variant="outline">write_inventory</Badge>{" "}
              {canWrite === null ? "unknown (Shopify unreachable)" : "missing"} —
              drafts and review work now; the Write button unlocks once the
              scope is added in the Shopify admin.
            </span>
          </>
        )}
      </div>

      {!draft ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 pt-6">
            <div className="text-sm">
              <p className="font-medium">Step 1 — build the draft</p>
              <p className="text-muted-foreground mt-1">
                Compares the book&apos;s{" "}
                <span className="font-semibold tabular-nums">{bookItems}</span>{" "}
                items (
                <span className="tabular-nums">{bookUnits}</span> units
                {lastCounted &&
                  `, last counted ${formatInTimeZone(new Date(lastCounted), location.timezone, "MMM d")}`}
                ) against Shopify&apos;s current stock and lists every
                difference for review. Nothing is written in this step.
              </p>
            </div>
            {bookItems > 0 ? (
              <BuildPushDraftButton locationId={location.id} />
            ) : (
              <p className="text-muted-foreground text-sm">
                The book is empty — finalize an inventory count first.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {stale && (
            <Alert>
              <TriangleAlert className="size-4" />
              <AlertTitle>This draft is out of date</AlertTitle>
              <AlertDescription>
                A count was finalized after the draft was built — its numbers no
                longer match the book. Discard it and build a fresh one.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="font-semibold tabular-nums">{totals.rows}</span>{" "}
              <span className="text-muted-foreground">rows to write</span>
            </span>
            <span>
              <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                +{totals.unitsUp}
              </span>{" "}
              <span className="text-muted-foreground">units up</span>
            </span>
            <span>
              <span className="font-semibold tabular-nums text-red-700 dark:text-red-400">
                −{totals.unitsDown}
              </span>{" "}
              <span className="text-muted-foreground">units down</span>
            </span>
            <span className="text-muted-foreground">
              in sync <span className="tabular-nums">{draft.in_sync_items}</span>{" "}
              · skipped{" "}
              <span className="tabular-nums">{draft.skipped_unknown}</span>{" "}
              unknown +{" "}
              <span className="tabular-nums">{draft.skipped_no_variant}</span>{" "}
              unmatched · book{" "}
              <span className="tabular-nums">{draft.book_items}</span> items
            </span>
          </div>

          <Card>
            <CardContent className="pt-6">
              {items.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing to correct — the book already matches Shopify.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <PushItemsTable items={items} />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <DiscardDraftDialog draftId={draft.id} />
            <ApplyDraftDialog
              draftId={draft.id}
              rows={totals.rows}
              unitsUp={totals.unitsUp}
              unitsDown={totals.unitsDown}
              shopifyLocationName={draft.shopify_location_name ?? "the store"}
              disabledReason={disabledReason}
            />
          </div>
        </>
      )}
    </div>
  );
}
