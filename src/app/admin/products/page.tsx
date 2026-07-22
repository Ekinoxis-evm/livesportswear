import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { isShopifyConfigured } from "@/lib/shopify-config";
import {
  fetchProductCatalog,
  fetchProductTypes,
  type CatalogProduct,
} from "@/lib/shopify";
import { formatMoney } from "@/lib/commission";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; after?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const type = sp.type ?? "";

  const configured = isShopifyConfigured();
  const [page, types] = configured
    ? await Promise.all([
        fetchProductCatalog({ search: q, productType: type, after: sp.after }).catch(
          () => null,
        ),
        fetchProductTypes().catch(() => [] as string[]),
      ])
    : [null, [] as string[]];

  const products: CatalogProduct[] = page?.products ?? [];

  const href = (next: Partial<{ q: string; type: string; after: string | null }>) => {
    const p = new URLSearchParams();
    const query = next.q ?? q;
    if (query) p.set("q", query);
    const t = next.type === undefined ? type : next.type;
    if (t) p.set("type", t);
    if (next.after) p.set("after", next.after);
    const s = p.toString();
    return s ? `/admin/products?${s}` : "/admin/products";
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your Shopify catalog. Counting, new stock and the inventory book live
          under this section.
        </p>
      </div>

      <form method="GET" action="/admin/products" className="relative max-w-sm">
        {type && <input type="hidden" name="type" value={type} />}
        <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" />
        <Input
          name="q"
          defaultValue={q}
          className="pl-8"
          placeholder="Search by title or SKU…"
        />
      </form>

      {types.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={href({ type: "", after: null })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              !type ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            All types
          </Link>
          {types.map((t) => (
            <Link
              key={t}
              href={href({ type: t, after: null })}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                type === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {t}
            </Link>
          ))}
        </div>
      )}

      {!configured ? (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            Shopify isn&apos;t connected yet.
          </CardContent>
        </Card>
      ) : page === null ? (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            Shopify is unavailable right now.
          </CardContent>
        </Card>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            No products match{q ? ` “${q}”` : ""}
            {type ? ` in ${type}` : ""}.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <Card key={p.id} className="overflow-hidden py-0">
                <div className="bg-muted aspect-square w-full">
                  {p.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <CardContent className="flex flex-col gap-1 p-3">
                  <span className="line-clamp-2 text-sm font-medium">{p.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {p.productType ?? "—"}
                  </span>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {p.price != null ? formatMoney(p.price, p.currency ?? "USD") : "—"}
                    </span>
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        (p.inventory ?? 0) > 0
                          ? "text-muted-foreground"
                          : "font-medium text-amber-600 dark:text-amber-500",
                      )}
                    >
                      {p.inventory ?? 0} in stock
                    </span>
                  </div>
                  {p.status !== "ACTIVE" && (
                    <span className="text-muted-foreground text-xs uppercase">
                      {p.status.toLowerCase()}
                    </span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {page.hasNextPage && page.endCursor && (
            <div className="flex justify-center">
              <Link
                href={href({ after: page.endCursor })}
                className="hover:bg-muted rounded-md border px-4 py-2 text-sm"
              >
                Load more
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
