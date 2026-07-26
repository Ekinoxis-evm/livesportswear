import Link from "next/link";
import { Search, Users } from "lucide-react";
import { storeListClients } from "@/server/store-floor";
import { StoreClientsTable } from "@/components/store/store-clients-table";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default async function StoreClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();

  const res = await storeListClients({ page, q });
  const clients = res.ok && res.data ? res.data.clients : [];
  const total = res.ok && res.data ? res.data.total : 0;
  const pages = res.ok && res.data ? res.data.pages : 1;

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/store/clients?${s}` : "/store/clients";
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Users className="text-primary size-5" />
        <h1 className="text-xl font-bold">Clients</h1>
        {!q && total > 0 && (
          <span className="text-muted-foreground text-sm tabular-nums">
            {total.toLocaleString()}
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        Your store&apos;s clients. Tick who&apos;s saved in the store WhatsApp, and
        send a hello or a thank-you.
      </p>

      <form method="GET" action="/store/clients" className="relative">
        <Search className="text-muted-foreground absolute left-3 top-3 size-4" />
        <Input
          name="q"
          defaultValue={q}
          className="h-11 pl-9"
          placeholder="Search a client by name…"
        />
      </form>

      <Card>
        <CardContent className="pt-6">
          {clients.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {q ? "No clients match that search." : "No clients yet."}
            </p>
          ) : (
            <StoreClientsTable rows={clients} />
          )}
        </CardContent>
      </Card>

      {!q && pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground tabular-nums">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={href(page - 1)} className="hover:bg-muted rounded-md border px-4 py-2">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={href(page + 1)} className="hover:bg-muted rounded-md border px-4 py-2">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
