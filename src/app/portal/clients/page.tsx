import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { fetchCustomersDetails, type ShopifyCustomer } from "@/lib/shopify";
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
import { ScrollTable } from "@/components/shared/scroll-table";
import { ContactButtons } from "@/components/shared/contact-buttons";
import { Stat, StatGrid } from "@/components/portal/stats";

const PAGE_SIZE = 50;

type OriginRow = {
  shopify_customer_id: string;
  first_order_name: string | null;
  first_order_at: string;
};

export default async function PortalClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const { employee } = await requireEmployee();
  const supabase = await createServerClient();
  const page = Math.max(1, Number(sp.page) || 1);

  const myStaffId = employee.shopify_staff_id
    ? normalizeStaffId(employee.shopify_staff_id)
    : null;

  // RLS (customer_origin_own_clients_read) already limits these rows to this
  // rep's own clients; the staff_id filter is belt-and-braces, not the boundary.
  const { data, count } = myStaffId
    ? await supabase
        .from("customer_origin")
        .select("shopify_customer_id, first_order_name, first_order_at", {
          count: "exact",
        })
        .eq("staff_id", myStaffId)
        .order("first_order_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    : { data: [], count: 0 };

  const origins = (data ?? []) as OriginRow[];
  const total = count ?? 0;

  const details =
    origins.length > 0 && isShopifyConfigured()
      ? await fetchCustomersDetails(origins.map((o) => o.shopify_customer_id)).catch(
          () => null,
        )
      : new Map<string, ShopifyCustomer>();
  const shopifyDown = details === null;
  const customers = details ?? new Map<string, ShopifyCustomer>();

  const rows = origins.map((o) => {
    const customer = customers.get(o.shopify_customer_id) ?? null;
    return {
      id: o.shopify_customer_id,
      customer,
      country: countryFromPhone(customer?.phone),
      firstOrderAt: o.first_order_at,
    };
  });

  const spend = rows.reduce((a, r) => a + (r.customer?.totalSpent ?? 0), 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Clients</h1>
        <p className="text-muted-foreground text-sm">
          Everyone you brought into the store — the clients whose first in-store
          order was yours.
        </p>
      </div>

      {myStaffId === null ? (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            Ask your admin to link your Shopify profile to see your clients here.
          </CardContent>
        </Card>
      ) : total === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            No clients yet. Every time you make a customer&apos;s first in-store
            sale, they land here.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <StatGrid>
                <Stat label="Clients" value={total.toLocaleString()} />
                <Stat
                  label="Spend on this page"
                  value={shopifyDown ? "—" : formatMoney(spend)}
                />
                <Stat
                  label="Newest"
                  value={rows[0] ? fullDate(rows[0].firstOrderAt.slice(0, 10)) : "—"}
                />
              </StatGrid>
            </CardContent>
          </Card>

          {page === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Latest clients</CardTitle>
                <CardDescription>The most recent people you brought in.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {rows.slice(0, 6).map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <Link
                      href={`/portal/clients/${r.id}`}
                      className="flex min-w-0 flex-col hover:underline"
                    >
                      <span className="font-medium">
                        {r.customer?.name ?? "Customer"}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {r.country ? `${r.country.flag} ${r.country.name} · ` : ""}
                        {fullDate(r.firstOrderAt.slice(0, 10))}
                      </span>
                    </Link>
                    <ContactButtons
                      phone={r.customer?.phone}
                      email={r.customer?.email}
                      size="sm"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">All your clients</CardTitle>
              <CardDescription>
                {total.toLocaleString()} in total · tap a name for their profile
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {shopifyDown && (
                <p className="text-muted-foreground text-sm">
                  Shopify is unavailable right now — names and totals are missing.
                </p>
              )}
              <ScrollTable maxHeight="32rem">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="py-2 font-medium">Client</th>
                      <th className="py-2 font-medium">Country</th>
                      <th className="py-2 font-medium">Contact</th>
                      <th className="py-2 font-medium">First order</th>
                      <th className="py-2 text-right font-medium">Orders</th>
                      <th className="py-2 text-right font-medium">Total spent</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">
                          <Link href={`/portal/clients/${r.id}`} className="hover:underline">
                            {r.customer?.name ?? "Customer"}
                          </Link>
                        </td>
                        <td className="py-2 whitespace-nowrap">
                          {r.country ? (
                            <>
                              <span aria-hidden>{r.country.flag}</span> {r.country.name}
                            </>
                          ) : (
                            <span className="text-muted-foreground">unknown</span>
                          )}
                        </td>
                        <td className="py-2">
                          <ContactButtons
                            phone={r.customer?.phone}
                            email={r.customer?.email}
                            size="sm"
                          />
                        </td>
                        <td className="text-muted-foreground py-2 tabular-nums">
                          {fullDate(r.firstOrderAt.slice(0, 10))}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {r.customer ? r.customer.ordersCount : "—"}
                        </td>
                        <td className="py-2 text-right font-medium tabular-nums">
                          {r.customer ? formatMoney(r.customer.totalSpent) : "—"}
                        </td>
                        <td className="py-2 text-right">
                          <Link
                            href={`/portal/clients/${r.id}`}
                            aria-label="Open client profile"
                            className="text-muted-foreground hover:text-foreground inline-flex"
                          >
                            <ChevronRight className="size-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>

              {pages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground tabular-nums">
                    Page {page} of {pages}
                  </span>
                  <div className="flex gap-2">
                    {page > 1 && (
                      <Link
                        href={`/portal/clients?page=${page - 1}`}
                        className="hover:bg-muted rounded-md border px-3 py-1"
                      >
                        Previous
                      </Link>
                    )}
                    {page < pages && (
                      <Link
                        href={`/portal/clients?page=${page + 1}`}
                        className="hover:bg-muted rounded-md border px-3 py-1"
                      >
                        Next
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
