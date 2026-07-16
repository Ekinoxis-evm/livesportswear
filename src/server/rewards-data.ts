import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { customRangeInTz, normalizeStaffId } from "@/lib/shopify-range";
import { getStaffSalesCached } from "@/lib/shopify-range-cache";
import {
  asPersonalGoals,
  asPrizes,
  buildResults,
  computeStandings,
  contestStatus,
  type Contest,
  type ContestSale,
  type ContestStandings,
} from "@/lib/rewards";

type Service = ReturnType<typeof createServiceClient>;
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
    goal_source: row.goal_source === "monthly" ? "monthly" : "custom",
    personal_goals: asPersonalGoals(row.personal_goals),
    prizes: asPrizes(row.prizes),
  };
}

/**
 * Monthly mode gates on the end-date month: that whole month's attributed
 * sales (monthly_sales, already synced) vs the store's configured goal.
 */
async function monthlyGate(
  service: Service,
  locationId: string,
  endDate: string,
): Promise<{ total: number; threshold: number }> {
  const month = endDate.slice(0, 7);
  const [{ data: goalRow }, { data: emps }] = await Promise.all([
    service
      .from("store_goals")
      .select("goal_amount")
      .eq("location_id", locationId)
      .eq("year", Number(month.slice(0, 4)))
      .eq("month", Number(month.slice(5, 7)))
      .maybeSingle(),
    service.from("employees").select("id").eq("location_id", locationId),
  ]);
  const ids = new Set((emps ?? []).map((e) => e.id));
  const { data: sales } = await service
    .from("monthly_sales")
    .select("employee_id, amount")
    .eq("month", month);
  const total = (sales ?? [])
    .filter((s) => ids.has(s.employee_id))
    .reduce((a, s) => a + Number(s.amount), 0);
  return { total, threshold: Number(goalRow?.goal_amount ?? 0) };
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
  const service = createServiceClient();
  const [sales, gateOverride] = await Promise.all([
    contestSales(row.location_id, contest, tz),
    contest.goal_source === "monthly"
      ? monthlyGate(service, row.location_id, contest.end_date)
      : Promise.resolve(undefined),
  ]);
  if (sales === null) return null;
  return computeStandings(contest, sales, businessDate(tz), gateOverride);
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
