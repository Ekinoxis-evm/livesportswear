import Link from "next/link";
import { Info, Search } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { RebuildAttributionButton } from "@/components/admin/rebuild-attribution-button";
import {
  ClientRepFilter,
  type RepOption,
} from "@/components/admin/client-rep-filter";

const PAGE_SIZE = 50;

/** One row per (rep, country) pair — every rollup on this page derives from it. */
type TallyRow = {
  staff_id: string | null;
  country_iso: string | null;
  clients: number;
};

// Sort keys → DB columns (the default list only; a search stays Shopify-ordered).
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
  // Cached Shopify stats (null on a search row, or before the first stats sync).
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
  broughtInBy: string; // rep name, "former staff", or "—"
  firstOrderName: string | null;
  firstOrderAt: string | null;
  visits: number; // from our own floor events, where we have them
  orders: number | null;
  spent: number | null;
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    rep?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createServerClient();
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = sp.sort && SORT_COLS[sp.sort] ? sp.sort : "first_order";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  // Every employee, NOT just active ones: attribution reaches back to 2024, and
  // the biggest client-bringers are often people who have since left. Filtering
  // to active would hide their clients behind "former staff" with no way to see
  // them.
  // One short column across every row: the rollups below must describe the WHOLE
  // book, not the 50 clients on screen. ~6k two-letter strings is nothing, and
  // deriving country per page is exactly what made the old card disagree with
  // its own total.
  const [{ data: employeeRows }, { data: tallyData }] = await Promise.all([
    supabase.from("employees").select("id, name, shopify_staff_id, active").order("name"),
    // Counted in Postgres, not here. Pulling every row to count it in JS made
    // this page stop responding at ~6,000 clients.
    supabase.rpc("client_origin_tallies"),
  ]);
  const tallies = (tallyData ?? []) as TallyRow[];
  const employees = employeeRows ?? [];
  // staff_id is the stored truth; the employee is resolved here, so mapping a
  // rep to their Shopify account later re-attributes all history for free.
  const nameByStaff = new Map(
    employees
      .filter((e) => e.shopify_staff_id)
      .map((e) => [normalizeStaffId(e.shopify_staff_id as string), e.name]),
  );
  const rep = employees.find((e) => e.id === sp.rep) ?? null;

  // How the attribution actually landed — shown on the page so the numbers
  // aren't a black box, and so unmapped staff are visible rather than silent.
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
  const namedTotal = repOptions.reduce((a, r) => a + r.clients, 0);
  const unnamedTotal = attributedTotal - namedTotal;

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
            .select(
              "shopify_customer_id, first_order_name, first_order_at, staff_id, customer_name, orders_count, total_spent, country_iso, stats_synced_at",
            )
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
      .select(
        "shopify_customer_id, first_order_name, first_order_at, staff_id, customer_name, orders_count, total_spent, country_iso, stats_synced_at",
        { count: "exact" },
      )
      .order(SORT_COLS[sort], { ascending: dir === "asc", nullsFirst: false })
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
    // `customer` here is the live per-page fetch — used for contact (email/phone)
    // and as the fallback for a search row that has no cached stats yet.
    const customer = customers.get(o.shopify_customer_id) ?? null;
    return {
      customerId: o.shopify_customer_id,
      name: o.customer_name ?? customer?.name ?? `Customer ${o.shopify_customer_id}`,
      phone: customer?.phone ?? null,
      email: customer?.email ?? null,
      country: o.country_iso
        ? countryFromIso(o.country_iso)
        : countryFromPhone(customer?.phone),
      broughtInBy: o.staff_id
        ? (nameByStaff.get(normalizeStaffId(o.staff_id)) ?? "former staff")
        : "—",
      firstOrderName: o.first_order_name,
      firstOrderAt: o.first_order_at || null,
      visits: seen?.n ?? 0,
      orders: o.orders_count ?? customer?.ordersCount ?? null,
      spent: o.total_spent ?? customer?.totalSpent ?? null,
    };
  });
  const lastSynced = origins.find((o) => o.stats_synced_at)?.stats_synced_at ?? null;

  // The WHOLE book (scoped to the selected rep), from the stored country — not
  // the phones of whichever 50 rows are rendered. These counts must sum to the
  // client total shown beside them; that they didn't was the bug.
  const myStaff = rep?.shopify_staff_id ? normalizeStaffId(rep.shopify_staff_id) : null;
  const countryRows = countryTally(
    tallies
      .filter((t) => !myStaff || (t.staff_id && normalizeStaffId(t.staff_id) === myStaff))
      .map((t) => ({ country_iso: t.country_iso, clients: Number(t.clients) })),
  );
  const countryScopeTotal = countryRows.reduce((a, r) => a + r.clients, 0);

  const pages = q ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (
    next: Partial<{ rep: string | null; q: string; page: number; sort: string; dir: string }>,
  ) => {
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
    return qs ? `/admin/clients?${qs}` : "/admin/clients";
  };
  // A search is Shopify-ordered — sort only applies to the default list.
  const sortHref = (s: string, d: "asc" | "desc") => href({ sort: s, dir: d, page: 1 });

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

      <Alert>
        <Info className="size-4" />
        <AlertTitle>How this attribution works</AlertTitle>
        <AlertDescription>
          <p>
            Every in-store order records the staff member who rang it. A client
            belongs to whoever sold them their{" "}
            <strong className="text-foreground">first</strong> in-store order —
            so the credit follows the person who actually brought them through
            the door, not whoever served them most recently. Returns, draft and
            test orders are ignored.
          </p>
          {attributedTotal > 0 && (
            <p className="tabular-nums">
              <strong className="text-foreground">
                {attributedTotal.toLocaleString()}
              </strong>{" "}
              clients attributed
              {unnamedTotal > 0 && (
                <>
                  {" · "}
                  <strong className="text-foreground">
                    {unnamedTotal.toLocaleString()}
                  </strong>{" "}
                  sit on Shopify staff accounts not linked to an employee (shown
                  as “former staff”) — link them on the employee pages and their
                  clients move across automatically, no rebuild needed
                </>
              )}
              . Cash sales with no customer on the order belong to nobody and
              never appear here.
            </p>
          )}
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-end gap-4">
        <ClientRepFilter reps={repOptions} selected={rep?.id ?? null} total={attributedTotal} />
        <form method="GET" action="/admin/clients" className="relative max-w-sm flex-1">
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
              {rep ? `of ${rep.name}'s clients` : "clients"}, not just this page.
              Read from each phone number&apos;s country indicator — Shopify
              addresses are empty for almost every client, so the dial code is
              the only origin signal, and a client with no phone counts as
              unknown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {countryRows.map((row) => (
                <span
                  key={row.country?.iso ?? "unknown"}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                    !row.country && "border-amber-500/40 text-amber-600 dark:text-amber-500",
                  )}
                >
                  {row.country ? (
                    <>
                      <span aria-hidden>{row.country.flag}</span>
                      {row.country.name}
                    </>
                  ) : (
                    "No country indicator"
                  )}
                  <span className="font-semibold tabular-nums">{row.clients}</span>
                </span>
              ))}
            </div>
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
                  ? "No attribution yet — hit “Rebuild attribution” to sweep your Shopify order history and assign every client to the rep who first sold to them."
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
                            <span aria-hidden>{c.country.flag}</span>{" "}
                            {c.country.name}
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-500">
                            unknown
                          </span>
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
