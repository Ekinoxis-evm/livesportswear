import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { isShopifyConfigured } from "@/lib/shopify-config";
import {
  fetchCustomersDetails,
  searchCustomers,
  type ShopifyCustomer,
} from "@/lib/shopify";
import { normalizeStaffId } from "@/lib/shopify-range";
import { formatMoney } from "@/lib/commission";
import { shortDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RebuildAttributionButton } from "@/components/admin/rebuild-attribution-button";

const PAGE_SIZE = 50;

type OriginRow = {
  shopify_customer_id: string;
  first_order_name: string | null;
  first_order_at: string;
  staff_id: string | null;
};

type ClientRow = {
  customerId: string;
  customer: ShopifyCustomer | null;
  broughtInBy: string; // rep name, "former staff", or "—"
  firstOrderName: string | null;
  firstOrderAt: string | null;
  visits: number; // from our own floor events, where we have them
  linkedTotal: number;
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rep?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createServerClient();
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const { data: employeeRows } = await supabase
    .from("employees")
    .select("id, name, shopify_staff_id")
    .eq("active", true)
    .order("name");
  const employees = employeeRows ?? [];
  // staff_id is the stored truth; the employee is resolved here, so mapping a
  // rep to their Shopify account later re-attributes all history for free.
  const nameByStaff = new Map(
    employees
      .filter((e) => e.shopify_staff_id)
      .map((e) => [normalizeStaffId(e.shopify_staff_id as string), e.name]),
  );
  const rep = employees.find((e) => e.id === sp.rep) ?? null;

  /**
   * Shopify owns identity and search; we own attribution. A search goes to
   * Shopify and gets annotated; the default list is driven by our own table so
   * it stays fast, sortable and filterable by rep. Either way Shopify being
   * down degrades to rows without names, never to an error page.
   */
  async function loadClients(): Promise<{
    origins: OriginRow[];
    customers: Map<string, ShopifyCustomer>;
    total: number;
    shopifyDown: boolean;
  }> {
    const none = new Map<string, ShopifyCustomer>();

    if (q) {
      if (!isShopifyConfigured()) {
        return { origins: [], customers: none, total: 0, shopifyDown: true };
      }
      const found = await searchCustomers(q).catch(() => null);
      if (!found) {
        return { origins: [], customers: none, total: 0, shopifyDown: true };
      }
      const { data } = found.length
        ? await supabase
            .from("customer_origin")
            .select("shopify_customer_id, first_order_name, first_order_at, staff_id")
            .in(
              "shopify_customer_id",
              found.map((c) => c.id),
            )
        : { data: [] };
      const byId = new Map(
        ((data ?? []) as OriginRow[]).map((o) => [o.shopify_customer_id, o]),
      );
      return {
        origins: found.map(
          (c) =>
            byId.get(c.id) ?? {
              shopify_customer_id: c.id,
              first_order_name: null,
              first_order_at: "",
              staff_id: null,
            },
        ),
        customers: new Map(found.map((c) => [c.id, c])),
        total: found.length,
        shopifyDown: false,
      };
    }

    const base = supabase
      .from("customer_origin")
      .select("shopify_customer_id, first_order_name, first_order_at, staff_id", {
        count: "exact",
      })
      .order("first_order_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    const { data, count } = await (rep?.shopify_staff_id
      ? base.eq("staff_id", normalizeStaffId(rep.shopify_staff_id))
      : base);
    const rows = (data ?? []) as OriginRow[];

    if (rows.length === 0 || !isShopifyConfigured()) {
      return {
        origins: rows,
        customers: none,
        total: count ?? 0,
        shopifyDown: rows.length > 0,
      };
    }
    const details = await fetchCustomersDetails(
      rows.map((o) => o.shopify_customer_id),
    ).catch(() => null);
    return {
      origins: rows,
      customers: details ?? none,
      total: count ?? 0,
      shopifyDown: details === null,
    };
  }

  const { origins, customers, total, shopifyDown } = await loadClients();

  // Our floor events add visits + linked sales for the clients we've seen at
  // the kiosk. Additive only — they never drive the list.
  const ids = origins.map((o) => o.shopify_customer_id);
  const { data: eventRows } = ids.length
    ? await supabase
        .from("client_events")
        .select("shopify_customer_id, order_total")
        .in("shopify_customer_id", ids)
    : { data: [] };
  const visits = new Map<string, { n: number; total: number }>();
  for (const e of (eventRows ?? []) as {
    shopify_customer_id: string;
    order_total: number | string | null;
  }[]) {
    const acc = visits.get(e.shopify_customer_id) ?? { n: 0, total: 0 };
    acc.n += 1;
    acc.total += Number(e.order_total ?? 0);
    visits.set(e.shopify_customer_id, acc);
  }

  const clients: ClientRow[] = origins.map((o) => {
    const seen = visits.get(o.shopify_customer_id);
    return {
      customerId: o.shopify_customer_id,
      customer: customers.get(o.shopify_customer_id) ?? null,
      broughtInBy: o.staff_id
        ? (nameByStaff.get(normalizeStaffId(o.staff_id)) ?? "former staff")
        : "—",
      firstOrderName: o.first_order_name,
      firstOrderAt: o.first_order_at || null,
      visits: seen?.n ?? 0,
      linkedTotal: seen?.total ?? 0,
    };
  });

  const pages = q ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (next: Partial<{ rep: string | null; q: string; page: number }>) => {
    const p = new URLSearchParams();
    const r = next.rep === undefined ? (rep?.id ?? null) : next.rep;
    if (r) p.set("rep", r);
    const query = next.q ?? q;
    if (query) p.set("q", query);
    const pg = next.page ?? page;
    if (pg > 1) p.set("page", String(pg));
    const s = p.toString();
    return s ? `/admin/clients?${s}` : "/admin/clients";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Shopify is the client book. This adds the one thing it doesn&apos;t
            record: the rep who brought each client in, taken from their first
            in-store order.
          </p>
        </div>
        <RebuildAttributionButton />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={href({ rep: null, page: 1 })}
          className={cn(
            "rounded-full border px-3 py-1 text-sm",
            !rep ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          All reps
        </Link>
        {employees.map((e) => (
          <Link
            key={e.id}
            href={href({ rep: e.id, page: 1 })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              rep?.id === e.id
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted",
              !e.shopify_staff_id && "opacity-50",
            )}
          >
            {e.name}
          </Link>
        ))}
      </div>

      <form method="GET" action="/admin/clients" className="relative max-w-sm">
        <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" />
        <Input
          name="q"
          defaultValue={q}
          className="pl-8"
          placeholder="Search Shopify by name, email, or phone…"
        />
      </form>

      {shopifyDown && (
        <p className="text-muted-foreground text-sm">
          Shopify is unavailable right now — names and totals are missing below.
        </p>
      )}

      <Card>
        <CardContent className="pt-6">
          {clients.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {q
                ? "No clients match that search in Shopify."
                : total === 0
                  ? "No attribution yet — hit “Rebuild attribution” to sweep your Shopify order history and assign every client to the rep who first sold to them."
                  : "Nothing on this page."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 font-medium">Client</th>
                    <th className="py-2 font-medium">Brought in by</th>
                    <th className="hidden py-2 font-medium sm:table-cell">First order</th>
                    <th className="hidden py-2 text-right font-medium sm:table-cell">
                      Visits
                    </th>
                    <th className="py-2 text-right font-medium">Orders</th>
                    <th className="py-2 text-right font-medium">Total spent</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.customerId} className="border-b last:border-0">
                      <td className="py-2">
                        <span className="flex flex-col">
                          <span className="font-medium">
                            {c.customer?.name ?? `Customer ${c.customerId}`}
                          </span>
                          {(c.customer?.email || c.customer?.phone) && (
                            <span className="text-muted-foreground text-xs">
                              {[c.customer.email, c.customer.phone]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "py-2 font-semibold",
                          c.broughtInBy === "former staff" && "text-muted-foreground font-normal italic",
                        )}
                      >
                        {c.broughtInBy}
                      </td>
                      <td className="text-muted-foreground hidden py-2 tabular-nums sm:table-cell">
                        {c.firstOrderAt
                          ? `${c.firstOrderName ?? ""} ${shortDate(c.firstOrderAt.slice(0, 10))}`.trim()
                          : "—"}
                      </td>
                      <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                        {c.visits > 0 ? c.visits : "—"}
                      </td>
                      <td className="text-muted-foreground py-2 text-right tabular-nums">
                        {c.customer ? c.customer.ordersCount : "—"}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {c.customer ? formatMoney(c.customer.totalSpent) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground tabular-nums">
            {total.toLocaleString()} clients · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={href({ page: page - 1 })} className="rounded-md border px-3 py-1 hover:bg-muted">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={href({ page: page + 1 })} className="rounded-md border px-3 py-1 hover:bg-muted">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
