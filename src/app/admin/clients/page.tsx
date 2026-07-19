import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { fetchCustomersByIds, type CustomerStats } from "@/lib/shopify";
import { formatMoney } from "@/lib/commission";
import { shortDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type EventRow = {
  shopify_customer_id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  employee_id: string;
  got_contact: boolean;
  order_total: number | string | null;
  business_date: string;
  location_id: string;
  employees: { name: string } | null;
};

type ClientRow = {
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  contactBy: string; // the rep who captured the contact — the headline
  visits: number;
  linkedTotal: number;
  lastSeen: string;
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; location?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createServerClient();

  const [{ data: locationRows }, { data: eventRows }] = await Promise.all([
    supabase.from("locations").select("id, name").eq("active", true).order("name"),
    // RLS scopes rows to the admin's locations; ordered so "first event wins"
    // attribution is deterministic.
    supabase
      .from("client_events")
      .select(
        "shopify_customer_id, customer_name, customer_email, customer_phone, employee_id, got_contact, order_total, business_date, location_id, employees(name)",
      )
      .not("shopify_customer_id", "is", null)
      .order("attended_at"),
  ]);
  const locations = locationRows ?? [];
  const location = locations.find((l) => l.id === sp.location) ?? null;

  const events = ((eventRows ?? []) as unknown as EventRow[]).filter(
    (e) => !location || e.location_id === location.id,
  );

  const byCustomer = new Map<string, EventRow[]>();
  for (const e of events) {
    const list = byCustomer.get(e.shopify_customer_id) ?? [];
    list.push(e);
    byCustomer.set(e.shopify_customer_id, list);
  }

  const q = (sp.q ?? "").trim().toLowerCase();
  const clients: ClientRow[] = [...byCustomer.entries()]
    .map(([customerId, list]) => {
      const latest = (pick: (e: EventRow) => string | null) =>
        [...list].reverse().find((e) => pick(e) !== null);
      const contactEvent = list.find((e) => e.got_contact) ?? list[0];
      return {
        customerId,
        name: latest((e) => e.customer_name)?.customer_name ?? "Customer",
        email: latest((e) => e.customer_email)?.customer_email ?? null,
        phone: latest((e) => e.customer_phone)?.customer_phone ?? null,
        contactBy: contactEvent.employees?.name ?? "—",
        visits: list.length,
        linkedTotal: list.reduce((a, e) => a + Number(e.order_total ?? 0), 0),
        lastSeen: list[list.length - 1].business_date,
      };
    })
    .filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
    )
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.name.localeCompare(b.name));

  // Live Shopify stats — degrade to nothing when unreachable.
  let stats = new Map<string, CustomerStats>();
  if (clients.length > 0 && isShopifyConfigured()) {
    stats = await fetchCustomersByIds(clients.map((c) => c.customerId)).catch(
      () => new Map(),
    );
  }

  const href = (next: Partial<{ location: string | null; q: string }>) => {
    const p = new URLSearchParams();
    const loc = next.location === undefined ? location?.id : next.location;
    if (loc) p.set("location", loc);
    const query = next.q ?? q;
    if (query) p.set("q", query);
    const s = p.toString();
    return s ? `/admin/clients?${s}` : "/admin/clients";
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every client linked from a sold event — and the rep who captured the
          contact. Grows with each order linked at the kiosk.
        </p>
      </div>

      {locations.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={href({ location: null })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              !location
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            All stores
          </Link>
          {locations.map((l) => (
            <Link
              key={l.id}
              href={href({ location: l.id })}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                location?.id === l.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {l.name}
            </Link>
          ))}
        </div>
      )}

      <form method="GET" action="/admin/clients" className="relative max-w-sm">
        {location && <input type="hidden" name="location" value={location.id} />}
        <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" />
        <Input
          name="q"
          defaultValue={q}
          className="pl-8"
          placeholder="Search name, email, or phone…"
        />
      </form>

      <Card>
        <CardContent className="pt-6">
          {clients.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {q
                ? "No clients match the search."
                : "No linked clients yet — link orders when marking Sold on the kiosk; every linked sale builds this list."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 font-medium">Client</th>
                    <th className="py-2 font-medium">Contact by</th>
                    <th className="py-2 text-right font-medium">Visits</th>
                    <th className="py-2 text-right font-medium">Linked sales</th>
                    <th className="py-2 text-right font-medium">Shopify orders</th>
                    <th className="py-2 text-right font-medium">Total spent</th>
                    <th className="py-2 text-right font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const s = stats.get(c.customerId);
                    return (
                      <tr key={c.customerId} className="border-b last:border-0">
                        <td className="py-2">
                          <span className="flex flex-col">
                            <span className="font-medium">{c.name}</span>
                            {(c.email || c.phone) && (
                              <span className="text-muted-foreground text-xs">
                                {[c.email, c.phone].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-2 font-semibold">{c.contactBy}</td>
                        <td className="py-2 text-right tabular-nums">{c.visits}</td>
                        <td className="py-2 text-right tabular-nums">
                          {c.linkedTotal > 0 ? formatMoney(c.linkedTotal) : "—"}
                        </td>
                        <td className="text-muted-foreground py-2 text-right tabular-nums">
                          {s ? s.ordersCount : "—"}
                        </td>
                        <td className="py-2 text-right font-medium tabular-nums">
                          {s ? formatMoney(s.totalSpent) : "—"}
                        </td>
                        <td className="text-muted-foreground py-2 text-right tabular-nums">
                          {shortDate(c.lastSeen)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
