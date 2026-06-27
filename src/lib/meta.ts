import "server-only";
import {
  META_ACCESS_TOKEN,
  META_AD_ACCOUNT_ID,
  META_API_VERSION,
} from "@/lib/meta-config";

const GRAPH = "https://graph.facebook.com";

function accountId(): string {
  const id = META_AD_ACCOUNT_ID.trim();
  return id.startsWith("act_") ? id : `act_${id}`;
}

export type CampaignDay = {
  date: string;
  campaign_id: string;
  campaign_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  currency: string | null;
};

type MetaAction = { action_type: string; value: string };

// Prefer omni_purchase (Meta's de-duped total); else sum the pixel/standard ones.
const PURCHASE_TYPES = new Set([
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
]);

function sumPurchases(arr: MetaAction[] | undefined): number {
  if (!arr) return 0;
  const omni = arr.find((a) => a.action_type === "omni_purchase");
  if (omni) return Number(omni.value) || 0;
  return arr
    .filter((a) => PURCHASE_TYPES.has(a.action_type))
    .reduce((s, a) => s + (Number(a.value) || 0), 0);
}

/** Per-campaign, per-day insights for [since, until] (inclusive). Paginates. */
export async function fetchInsights(
  since: string,
  until: string,
): Promise<CampaignDay[]> {
  const params = new URLSearchParams({
    access_token: META_ACCESS_TOKEN,
    level: "campaign",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields:
      "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values,account_currency",
    limit: "500",
  });

  let url: string | null =
    `${GRAPH}/${META_API_VERSION}/${accountId()}/insights?${params.toString()}`;
  const out: CampaignDay[] = [];

  while (url) {
    const res = await fetch(url);
    const json = (await res.json()) as {
      data?: Array<{
        date_start: string;
        campaign_id: string;
        campaign_name?: string;
        spend?: string;
        impressions?: string;
        clicks?: string;
        actions?: MetaAction[];
        action_values?: MetaAction[];
        account_currency?: string;
      }>;
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (json.error) throw new Error(`Meta API: ${json.error.message ?? "error"}`);

    for (const row of json.data ?? []) {
      out.push({
        date: row.date_start,
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name ?? null,
        spend: Number(row.spend) || 0,
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        purchases: Math.round(sumPurchases(row.actions)),
        revenue: sumPurchases(row.action_values),
        currency: row.account_currency ?? null,
      });
    }
    url = json.paging?.next ?? null;
  }
  return out;
}
