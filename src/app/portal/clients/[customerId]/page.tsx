import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { isShopifyConfigured } from "@/lib/shopify-config";
import {
  fetchCustomerOrders,
  fetchCustomersDetails,
  fetchProductsByIds,
  type ProductCard,
} from "@/lib/shopify";
import { normalizeStaffId } from "@/lib/shopify-range";
import { countryFromPhone } from "@/lib/phone-country";
import { formatMoney } from "@/lib/commission";
import { fullDate } from "@/lib/format-date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ContactButtons } from "@/components/shared/contact-buttons";
import { Stat, StatGrid } from "@/components/portal/stats";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const { employee } = await requireEmployee();
  const supabase = await createServerClient();

  const myStaffId = employee.shopify_staff_id
    ? normalizeStaffId(employee.shopify_staff_id)
    : null;
  if (!myStaffId) notFound();

  // OWNERSHIP GATE. The customer id is in the URL, so this is the only thing
  // stopping a rep from reading someone else's client. RLS already scopes the
  // table to their own rows, and this re-checks staff_id explicitly — a miss is
  // a 404, never a "not allowed" that would confirm the client exists.
  const { data: origin } = await supabase
    .from("customer_origin")
    .select("shopify_customer_id, first_order_name, first_order_at, staff_id")
    .eq("shopify_customer_id", customerId)
    .eq("staff_id", myStaffId)
    .maybeSingle();
  if (!origin) notFound();

  if (!isShopifyConfigured()) notFound();
  const [details, orders] = await Promise.all([
    fetchCustomersDetails([customerId]).catch(() => null),
    fetchCustomerOrders(customerId).catch(() => null),
  ]);
  const customer = details?.get(customerId) ?? null;

  const productIds = (orders ?? [])
    .flatMap((o) => o.items.map((i) => i.productId))
    .filter((id): id is string => Boolean(id));
  const products: Map<string, ProductCard> =
    productIds.length > 0
      ? await fetchProductsByIds(productIds).catch(() => new Map())
      : new Map();

  const country = countryFromPhone(customer?.phone);
  const orderCount = orders?.length ?? 0;
  const spent = (orders ?? []).reduce((a, o) => a + o.net, 0);
  const lastOrder = orders?.[0] ?? null;
  const currency = lastOrder?.currency ?? "USD";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/portal/clients"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        All clients
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{customer?.name ?? "Customer"}</h1>
          <p className="text-muted-foreground text-sm">
            {country ? `${country.flag} ${country.name} · ` : ""}
            You brought them in on {fullDate(origin.first_order_at.slice(0, 10))}
            {origin.first_order_name ? ` (${origin.first_order_name})` : ""}
          </p>
        </div>
        <ContactButtons phone={customer?.phone} email={customer?.email} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <StatGrid>
            <Stat label="Total spent" value={formatMoney(spent, currency)} />
            <Stat label="Orders" value={String(orderCount)} />
            <Stat
              label="Average ticket"
              value={orderCount ? formatMoney(round2(spent / orderCount), currency) : "—"}
            />
            <Stat
              label="Last purchase"
              value={lastOrder ? fullDate(lastOrder.createdAt.slice(0, 10)) : "—"}
            />
            <Stat
              label="Client since"
              value={
                customer?.createdAt ? fullDate(customer.createdAt.slice(0, 10)) : "—"
              }
            />
          </StatGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What they bought</CardTitle>
          <CardDescription>
            Every garment across their {orderCount} order
            {orderCount === 1 ? "" : "s"}, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {orders === null ? (
            <p className="text-muted-foreground text-sm">
              Shopify is unavailable right now.
            </p>
          ) : orders.length === 0 ? (
            <p className="text-muted-foreground text-sm">No orders on record.</p>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium tabular-nums">{order.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {fullDate(order.createdAt.slice(0, 10))} ·{" "}
                    <span className="text-foreground font-semibold">
                      {formatMoney(order.net, order.currency ?? currency)}
                    </span>
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {order.items.map((item, i) => {
                    const product = item.productId
                      ? products.get(item.productId)
                      : undefined;
                    return (
                      <div
                        key={`${order.id}-${i}`}
                        className="flex items-center gap-3 rounded-md border p-2"
                      >
                        {product?.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.image}
                            alt=""
                            className="size-14 shrink-0 rounded object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="bg-muted size-14 shrink-0 rounded" />
                        )}
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">
                            {item.title}
                          </span>
                          <span className="text-muted-foreground truncate text-xs">
                            {[
                              item.variantTitle,
                              product?.productType,
                              item.quantity > 1 ? `×${item.quantity}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <span className="text-xs tabular-nums">
                            {formatMoney(item.price, order.currency ?? currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
