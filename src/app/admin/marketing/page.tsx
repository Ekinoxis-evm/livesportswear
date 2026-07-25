import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { businessDate } from "@/lib/business-date";
import { primaryTimezone } from "@/lib/business-tz";
import { isMetaConfigured } from "@/lib/meta-config";
import { formatMoney } from "@/lib/commission";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { monthLabel } from "@/lib/format-date";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}

export default async function MarketingPage() {
  await requireAdmin();
  const supabase = await createServerClient();

  const today = businessDate(await primaryTimezone());
  const month = today.slice(0, 7);

  const { data: rows } = await supabase
    .from("ad_insights")
    .select(
      "date, campaign_id, campaign_name, spend, impressions, clicks, purchases, revenue, currency",
    )
    .gte("date", `${month}-01`)
    .lte("date", today)
    .order("date");
  const insights = rows ?? [];
  const currency = insights[0]?.currency ?? "USD";

  const totals = insights.reduce(
    (a, r) => ({
      spend: a.spend + Number(r.spend),
      revenue: a.revenue + Number(r.revenue),
      impressions: a.impressions + Number(r.impressions),
      clicks: a.clicks + Number(r.clicks),
      purchases: a.purchases + Number(r.purchases),
    }),
    { spend: 0, revenue: 0, impressions: 0, clicks: 0, purchases: 0 },
  );
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const ctr =
    totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  const byCampaign = new Map<
    string,
    { id: string; name: string; spend: number; revenue: number; purchases: number }
  >();
  for (const r of insights) {
    const c = byCampaign.get(r.campaign_id) ?? {
      id: r.campaign_id,
      name: r.campaign_name ?? "—",
      spend: 0,
      revenue: 0,
      purchases: 0,
    };
    c.spend += Number(r.spend);
    c.revenue += Number(r.revenue);
    c.purchases += Number(r.purchases);
    byCampaign.set(r.campaign_id, c);
  }
  const campaigns = [...byCampaign.values()].sort((a, b) => b.spend - a.spend);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Meta Ads spend &amp; ROAS · {monthLabel(month)}
        </p>
      </div>

      {!isMetaConfigured() ? (
        <Alert>
          <AlertTitle>Connect Meta Ads</AlertTitle>
          <AlertDescription>
            Add your Meta token and ad account in Settings → Meta Ads to see
            spend and ROAS here.
          </AlertDescription>
        </Alert>
      ) : insights.length === 0 ? (
        <Alert>
          <AlertTitle>No data yet</AlertTitle>
          <AlertDescription>
            Run a sync from Settings → Meta Ads (the daily cron will keep it
            fresh).
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Spend" value={formatMoney(totals.spend, currency)} />
            <Kpi label="Revenue" value={formatMoney(totals.revenue, currency)} />
            <Kpi label="ROAS" value={`${roas.toFixed(2)}×`} />
            <Kpi label="Purchases" value={String(totals.purchases)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By campaign</CardTitle>
              <CardDescription>
                {totals.impressions.toLocaleString()} impressions ·{" "}
                {ctr.toFixed(2)}% CTR this month
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">
                      Revenue
                    </TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(c.spend, currency)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {formatMoney(c.revenue, currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.spend > 0 ? `${(c.revenue / c.spend).toFixed(2)}×` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
