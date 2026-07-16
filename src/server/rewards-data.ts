import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { customRangeInTz, normalizeStaffId } from "@/lib/shopify-range";
import { getStaffSalesCached } from "@/lib/shopify-range-cache";
import {
  asPrizes,
  buildResults,
  computeStandings,
  contestStatus,
  type Contest,
  type ContestSale,
  type ContestStandings,
} from "@/lib/rewards";
import type { SalesContest } from "@/types/db";

/**
 * Contest standings assembly. Roster = the contest location's active, mapped
 * employees at read time — someone who transfers or deactivates mid-contest
 * drops out of live standings but stays frozen in `results` once finalized.
 * Reads use the service client (kiosk and portal callers can't see coworker
 * rows under RLS); the only write here is the results snapshot.
 */

export function toContest(row: SalesContest): Contest {
  return {
    id: row.id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    store_threshold: Number(row.store_threshold),
    prizes: asPrizes(row.prizes),
  };
}

async function contestSales(
  locationId: string,
  contest: Contest,
  tz: string,
): Promise<ContestSale[] | null> {
  if (!isShopifyConfigured()) return null;
  const range = customRangeInTz(contest.start_date, contest.end_date, tz);
  const service = createServiceClient();
  const [entries, { data: emps }] = await Promise.all([
    getStaffSalesCached(range.start, range.endExclusive),
    service
      .from("employees")
      .select("id, name, shopify_staff_id")
      .eq("location_id", locationId)
      .eq("active", true)
      .not("shopify_staff_id", "is", null),
  ]);
  if (!entries) return null;
  const byStaff = new Map(entries);
  return (emps ?? []).map((e) => ({
    employeeId: e.id,
    name: e.name,
    amount: byStaff.get(normalizeStaffId(e.shopify_staff_id as string)) ?? 0,
  }));
}

/** Live standings for one contest; null when Shopify is unconfigured/down. */
export async function getContestStandings(
  row: SalesContest,
  tz: string,
): Promise<ContestStandings | null> {
  const contest = toContest(row);
  const sales = await contestSales(row.location_id, contest, tz);
  if (sales === null) return null;
  return computeStandings(contest, sales, businessDate(tz));
}

/**
 * Snapshot every ended, un-finalized contest. Idempotent (`results is null`
 * guard); runs from the daily cron, with /admin/rewards as an on-view
 * fallback so results never wait for tomorrow morning.
 */
export async function finalizeEndedContests(): Promise<{
  finalized: number;
  skipped: number;
}> {
  const service = createServiceClient();
  const { data: rows } = await service
    .from("sales_contests")
    .select("*, location:locations(timezone)")
    .is("results", null);

  const { data: cfg } = await service
    .from("commission_config")
    .select("currency")
    .eq("id", 1)
    .maybeSingle();
  const currency = cfg?.currency ?? "USD";

  let finalized = 0;
  let skipped = 0;
  for (const row of rows ?? []) {
    const tz =
      (row as { location: { timezone: string } | null }).location?.timezone ?? "UTC";
    const today = businessDate(tz);
    if (contestStatus(row, today) !== "ended") continue;
    const standings = await getContestStandings(row, tz);
    if (!standings) {
      skipped += 1; // Shopify down — the next run picks it up
      continue;
    }
    const { error } = await service
      .from("sales_contests")
      .update({ results: buildResults(standings, today, currency) })
      .eq("id", row.id)
      .is("results", null);
    if (error) skipped += 1;
    else finalized += 1;
  }
  return { finalized, skipped };
}
