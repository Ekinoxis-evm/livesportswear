import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isMetaConfigured } from "@/lib/meta-config";
import { fetchInsights } from "@/lib/meta";

export type MetaSyncResult =
  | { ok: true; rows: number }
  | { ok: false; error: string };

/** YYYY-MM → inclusive [since, until] day bounds for that month. */
function monthBounds(month: string): { since: string; until: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { since: `${month}-01`, until: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function runMetaSyncForMonth(month: string): Promise<MetaSyncResult> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Promise.resolve({ ok: false, error: "Invalid month." });
  }
  const { since, until } = monthBounds(month);
  return runMetaSync(since, until);
}

/**
 * Pulls Meta Ads insights for [since, until] and upserts ad_insights (one row
 * per campaign-day). Service client so it runs from the admin action and cron.
 */
async function runMetaSync(
  since: string,
  until: string,
): Promise<MetaSyncResult> {
  if (!isMetaConfigured()) {
    return { ok: false, error: "Meta Ads isn't connected yet." };
  }

  let rows;
  try {
    rows = await fetchInsights(since, until);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Meta error." };
  }

  if (rows.length === 0) return { ok: true, rows: 0 };

  const now = new Date().toISOString();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("ad_insights")
    .upsert(
      rows.map((r) => ({ ...r, updated_at: now })),
      { onConflict: "date,campaign_id" },
    );
  if (error) return { ok: false, error: error.message };

  return { ok: true, rows: rows.length };
}
