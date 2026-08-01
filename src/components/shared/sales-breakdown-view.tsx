import { formatMoney } from "@/lib/commission";
import type { SalesBreakdown } from "@/lib/sales-breakdown";
import { cn } from "@/lib/utils";

/**
 * The one way sales money is presented app-wide — Shopify's exact sales
 * breakdown and labels: Gross sales − Discounts − Returns = Net sales;
 * + Taxes = Total sales (the register figure). Net stays THE metric
 * (goals/commission/contests); Total is what reconciles to the POS drawer.
 * Numbers come straight from Shopify order fields (verified to the penny).
 */

export function SalesBreakdownBlock({
  sales,
  currency,
  className,
}: {
  sales: SalesBreakdown;
  currency?: string | null;
  className?: string;
}) {
  const money = (v: number) => formatMoney(v, currency ?? undefined);
  return (
    <dl className={cn("space-y-1 text-sm tabular-nums", className)}>
      <Row label="Gross sales" value={money(sales.gross)} />
      <Row label="Discounts" value={sales.discounts > 0 ? `−${money(sales.discounts)}` : money(0)} />
      <Row label="Returns" value={sales.returns > 0 ? `−${money(sales.returns)}` : money(0)} />
      <div className="flex items-baseline justify-between gap-4 border-t pt-1">
        <dt className="font-medium">Net sales</dt>
        <dd className="font-semibold">{money(sales.net)}</dd>
      </div>
      <Row label="Taxes" value={sales.taxes > 0 ? `+${money(sales.taxes)}` : money(0)} />
      <div className="flex items-baseline justify-between gap-4 border-t pt-1">
        <dt className="font-medium">Total sales</dt>
        <dd className="text-lg font-semibold">{money(sales.total)}</dd>
      </div>
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function SalesBreakdownSubline({
  sales,
  currency,
  className,
}: {
  sales: SalesBreakdown;
  currency?: string | null;
  className?: string;
}) {
  if (sales.discounts <= 0 && sales.returns <= 0 && sales.taxes <= 0) return null;
  const money = (v: number) => formatMoney(v, currency ?? undefined);
  const parts = [`gross ${money(sales.gross)}`];
  if (sales.discounts > 0) parts.push(`disc −${money(sales.discounts)}`);
  if (sales.returns > 0) parts.push(`ret −${money(sales.returns)}`);
  if (sales.taxes > 0) parts.push(`tax +${money(sales.taxes)}`);
  return (
    <span className={cn("text-muted-foreground text-xs tabular-nums", className)}>
      {parts.join(" · ")}
    </span>
  );
}
