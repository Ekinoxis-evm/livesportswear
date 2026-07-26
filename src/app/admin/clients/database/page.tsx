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
import {
  countryFromPhone,
  countryFromIso,
  countryTally,
  type Country,
} from "@/lib/phone-country";
import { formatMoney } from "@/lib/commission";
import { fullDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollTable } from "@/components/shared/scroll-table";
import { ServerSortTh } from "@/components/shared/server-sort-head";
import { ContactButtons } from "@/components/shared/contact-buttons";
import { CountryViews } from "@/components/admin/country-views";
import { ClientRepFilter, type RepOption } from "@/components/admin/client-rep-filter";

const PAGE_SIZE = 50;
const BASE = "/admin/clients/database";

type TallyRow = { staff_id: string | null; country_iso: string | null; clients: number };

const SORT_COLS: Record<string, string> = {
  name: "customer_name",
  first_order: "first_order_at",
  orders: "orders_count",
  spent: "total_spent",
  country: "country_iso",
};

type OriginRow = {
  shopify_customer_id: string;
  first_order_name: string | null;
  first_order_at: string;
  staff_id: string | null;
  customer_name?: string | null;
  orders_count?: number | null;
  total_spent?: number | null;
  country_iso?: string | null;
  stats_synced_at?: string | null;
};

type ClientRow = {
  customerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  country: Country | null;
  broughtInBy: string;
  firstOrderName: string | null;
  firstOrderAt: string | null;
  visits: number;
  orders: number | null;
  spent: number | null;
};

export default async function ClientsDatabasePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rep?: string; page?: string; sort?: string; dir?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createServerClient();
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = sp.sort && SORT_COLS[sp.sort] ? sp.sort : "first_order";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const [{ data: employeeRows }, { data: tallyData }] = await Promise.all([
    supabase.from("employees").select("id, name, shopify_staff_id, active").order("name"),
    supabase.rpc("client_origin_tallies"),
  ]);
  const tallies = (tallyData ?? []) as TallyRow[];
  const employees = employeeRows ?? [];
  const nameByStaff = new Map(
    employees
      .filter((e) => e.shopify_staff_id)
      .map((e) => [normalizeStaffId(e.shopify_staff_id as string), e.name]),
  );
  const rep = employees.find((e) => e.id === sp.rep) ?? null;

  const countByStaff = new Map<string, number>();
  let attributedTotal = 0;
  for (const t of tallies) {
    const key = t.staff_id ? normalizeStaffId(t.staff_id) : "";
    countByStaff.set(key, (countByStaff.get(key) ?? 0) + Number(t.clients));
    attributedTotal += Number(t.clients);
  }
  const repOptions: RepOption[] = employees
    .filter((e) => e.shopify_staff_id)
    .map((e) => ({
      id: e.id,
      name: e.name,
      active: e.active ?? true,
      clients: countByStaff.get(normalizeStaffId(e.shopify_staff_id as string)) ?? 0,
    }))
    .filter((r) => r.clients > 0)
    .sort((a, b) => b.clients - a.clients);

  const SELECT =
    "shopify_customer_id, first_order_name, first_order_at, staff_id, customer_name, orders_count, total_spent, country_iso, stats_synced_at";

  async function loadClients(): Promise<{
    origins: OriginRow[];
    customers: Map<string, ShopifyCustomer>;
    total: number;
    shopifyDown: boolean;
  }> {
    const none = new Map<string, ShopifyCustomer>();
    if (q) {
      if (!isShopifyConfigured()) return { origins: [], customers: none, total: 0, shopifyDown: true };
      const found = await searchCustomers(q).catch(() => null);
      if (!found) return { origins: [], customers: none, total: 0, shopifyDown: true };
      const { data } = found.length
        ? await supabase.from("customer_origin").select(SELECT).in("shopify_customer_id", found.map((c) => c.id))
        : { data: [] };
      const byId = new Map(((data ?? []) as OriginRow[]).map((o) => [o.shopify_customer_id, o]));
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
      .select(SELECT, { count: "exact" })
      .order(SORT_COLS[sort], { ascending: dir === "asc", nullsFirst: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    const { data, count } = await (rep?.shopify_staff_id
      ? base.eq("staff_id", normalizeStaffId(rep.shopify_staff_id))
      : base);
    const rows = (data ?? []) as OriginRow[];
    if (rows.length === 0 || !isShopifyConfigured()) {
      return { origins: rows, customers: none, total: count ?? 0, shopifyDown: rows.length > 0 };
    }
    const details = await fetchCustomersDetails(rows.map((o) => o.shopify_customer_id)).catch(() => null);
    return { origins: rows, customers: details ?? none, total: count ?? 0, shopifyDown: details === null };
  }

  const { origins, customers, total, shopifyDown } = await loadClients();

  const ids = origins.map((o) => o.shopify_customer_id);
  const { data: eventRows } = ids.length
    ? await supabase.from("client_events").select("shopify_customer_id, order_total").in("shopify_customer_id", ids)
    : { data: [] };
  const visits = new Map<string, number>();
  for (const e of (eventRows ?? []) as { shopify_customer_id: string }[]) {
    visits.set(e.shopify_customer_id, (visits.get(e.shopify_customer_id) ?? 0) + 1);
  }

  const clients: ClientRow[] = origins.map((o) => {
    const customer = customers.get(o.shopify_customer_id) ?? null;
    return {
      customerId: o.shopify_customer_id,
      name: o.customer_name ?? customer?.name ?? `Customer ${o.shopify_customer_id}`,
      phone: customer?.phone ?? null,
      email: customer?.email ?? null,
      country: o.country_iso ? countryFromIso(o.country_iso) : countryFromPhone(customer?.phone),
      broughtInBy: o.staff_id
        ? (nameByStaff.get(normalizeStaffId(o.staff_id)) ?? "former staff")
        : "—",
      firstOrderName: o.first_order_name,
      firstOrderAt: o.first_order_at || null,
      visits: visits.get(o.shopify_customer_id) ?? 0,
      orders: o.orders_count ?? customer?.ordersCount ?? null,
      spent: o.total_spent ?? customer?.totalSpent ?? null,
    };
  });
  const lastSynced = origins.find((o) => o.stats_synced_at)?.stats_synced_at ?? null;

  const myStaff = rep?.shopify_staff_id ? normalizeStaffId(rep.shopify_staff_id) : null;
  const countryRows = countryTally(
    tallies
      .filter((t) => !myStaff || (t.staff_id && normalizeStaffId(t.staff_id) === myStaff))
      .map((t) => ({ country_iso: t.country_iso, clients: Number(t.clients) })),
  );
  const countryScopeTotal = countryRows.reduce((a, r) => a + r.clients, 0);

  const pages = q ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (next: Partial<{ rep: string | null; q: string; page: number; sort: string; dir: string }>) => {
    const p = new URLSearchParams();
    const r = next.rep === undefined ? (rep?.id ?? null) : next.rep;
    if (r) p.set("rep", r);
    const query = next.q ?? q;
    if (query) p.set("q", query);
    const pg = next.page ?? page;
    if (pg > 1) p.set("page", String(pg));
    const s = next.sort ?? (sp.sort ? sort : "");
    const d = next.dir ?? (sp.dir ? dir : "");
    if (s) p.set("sort", s);
    if (d) p.set("dir", d);
    const qs = p.toString();
    return qs ? `${BASE}?${qs}` : BASE;
  };
  const sortHref = (s: string, d: "asc" | "desc") => href({ sort: s, dir: d, page: 1 });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <ClientRepFilter reps={repOptions} selected={rep?.id ?? null} total={attributedTotal} />
        <form method="GET" action={BASE} className="relative max-w-sm flex-1">
          <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" />
          <Input
            name="q"
            defaultValue={q}
            className="pl-8"
            placeholder="Search Shopify by name, email, or phone…"
          />
        </form>
      </div>

      {shopifyDown && (
        <p className="text-muted-foreground text-sm">
          Shopify is unavailable right now — names and totals are missing below.
        </p>
      )}

      {countryRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where these clients are from</CardTitle>
            <CardDescription>
              All {countryScopeTotal.toLocaleString()}{" "}
              {rep ? `of ${rep.name}'s clients` : "clients"}, not just this page —
              read from each phone number&apos;s country indicator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CountryViews
              rows={countryRows.map((row) => ({
                iso: row.country?.iso ?? null,
                name: row.country?.name ?? "No country indicator",
                flag: row.country?.flag ?? "",
                clients: row.clients,
              }))}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {clients.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {q
                ? "No clients match that search in Shopify."
                : total === 0
                  ? "No attribution yet — rebuild it on the Attribution tab."
                  : "Nothing on this page."}
            </p>
          ) : (
            <>
              {!q && lastSynced && (
                <p className="text-muted-foreground mb-3 text-xs">
                  Orders &amp; spend cached from Shopify — as of{" "}
                  {fullDate(lastSynced.slice(0, 10))}. Sort applies to the full book.
                </p>
              )}
              <ScrollTable maxHeight="34rem">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      {q ? (
                        <>
                          <th className="py-2 font-medium">Client</th>
                          <th className="py-2 font-medium">Country</th>
                        </>
                      ) : (
                        <>
                          <ServerSortTh sortKey="name" sort={sort} dir={dir} hrefFor={sortHref} className="py-2 font-medium">Client</ServerSortTh>
                          <ServerSortTh sortKey="country" sort={sort} dir={dir} hrefFor={sortHref} className="py-2 font-medium">Country</ServerSortTh>
                        </>
                      )}
                      <th className="py-2 font-medium">Contact</th>
                      <th className="py-2 font-medium">Brought in by</th>
                      <th className="py-2 font-medium">First order</th>
                      {q ? (
                        <th className="py-2 font-medium">Date</th>
                      ) : (
                        <ServerSortTh sortKey="first_order" sort={sort} dir={dir} hrefFor={sortHref} className="py-2 font-medium">Date</ServerSortTh>
                      )}
                      <th className="py-2 text-right font-medium">Visits</th>
                      {q ? (
                        <>
                          <th className="py-2 text-right font-medium">Orders</th>
                          <th className="py-2 text-right font-medium">Total spent</th>
                        </>
                      ) : (
                        <>
                          <ServerSortTh sortKey="orders" sort={sort} dir={dir} hrefFor={sortHref} className="py-2 text-right font-medium">Orders</ServerSortTh>
                          <ServerSortTh sortKey="spent" sort={sort} dir={dir} hrefFor={sortHref} className="py-2 text-right font-medium">Total spent</ServerSortTh>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr key={c.customerId} className="border-b last:border-0">
                        <td className="py-2 font-medium">{c.name}</td>
                        <td className="py-2">
                          {c.country ? (
                            <span className="whitespace-nowrap">
                              <span aria-hidden>{c.country.flag}</span> {c.country.name}
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-500">unknown</span>
                          )}
                        </td>
                        <td className="py-2">
                          <ContactButtons phone={c.phone} email={c.email} size="sm" />
                        </td>
                        <td
                          className={cn(
                            "py-2 font-semibold",
                            c.broughtInBy === "former staff" && "text-muted-foreground font-normal italic",
                          )}
                        >
                          {c.broughtInBy}
                        </td>
                        <td className="py-2 tabular-nums">{c.firstOrderName ?? "—"}</td>
                        <td className="text-muted-foreground py-2 tabular-nums">
                          {c.firstOrderAt ? fullDate(c.firstOrderAt.slice(0, 10)) : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {c.visits > 0 ? c.visits : "—"}
                        </td>
                        <td className="text-muted-foreground py-2 text-right tabular-nums">
                          {c.orders ?? "—"}
                        </td>
                        <td className="py-2 text-right font-medium tabular-nums">
                          {c.spent != null ? formatMoney(c.spent) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            </>
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
