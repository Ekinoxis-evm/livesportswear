"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Receipt, Repeat, Search, ShoppingBag, Undo2, X } from "lucide-react";
import { storeSearchProducts, storeRecentOrders } from "@/server/store-floor";
import type { FinishInput, FinishOrder } from "@/lib/finish-schema";
import type { ProductHit, RecentOrder } from "@/lib/shopify";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NO_SALE_REASONS = [
  "No size",
  "No color",
  "No design available",
  "Price too expensive",
  "Just browsing",
  "No reason",
];

export type FinishTarget = {
  employeeId: string;
  name: string;
  kind: "walkin" | "return";
};

export function FinishDialog({
  target,
  pending,
  onSubmit,
  onClose,
}: {
  target: FinishTarget | null;
  pending: boolean;
  onSubmit: (employeeId: string, input: FinishInput) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o && !pending) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        {target && (
          <FinishSteps
            key={`${target.employeeId}-${target.kind}`}
            target={target}
            pending={pending}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FinishSteps({
  target,
  pending,
  onSubmit,
}: {
  target: FinishTarget;
  pending: boolean;
  onSubmit: (employeeId: string, input: FinishInput) => void;
}) {
  const [step, setStep] = useState<"choice" | "order" | "contact" | "reasons">("choice");
  const [orders, setOrders] = useState<RecentOrder[] | null>(null);
  const [order, setOrder] = useState<RecentOrder | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [products, setProducts] = useState<ProductHit[]>([]);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // Debounced product search, driven by the input event (not an effect).
  const onQueryChange = (value: string) => {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const res = await storeSearchProducts(value);
      setSearching(false);
      setHits(res.ok ? (res.data ?? []) : []);
    }, 350);
  };

  const toggleReason = (r: string) =>
    setReasons((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  const addProduct = (p: ProductHit) => {
    setQuery("");
    setHits([]);
    setProducts((cur) =>
      cur.some((x) => x.id === p.id) || cur.length >= 5 ? cur : [...cur, p],
    );
  };

  if (target.kind === "return") {
    // One step, three choices. `sold` (which drives the metrics) is derived from
    // the type: only "both" (returned AND bought more) counts as an extra sale.
    const finishReturn = (return_type: "return" | "exchange" | "both", sold: boolean) =>
      onSubmit(target.employeeId, { kind: "return", sold, return_type });
    return (
      <>
        <DialogHeader>
          <DialogTitle>{target.name} — return / exchange</DialogTitle>
          <DialogDescription>What kind of transaction?</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            variant="outline"
            className="h-14 justify-start gap-3"
            disabled={pending}
            onClick={() => finishReturn("return", false)}
          >
            <Undo2 className="size-5" />
            <span className="flex flex-col items-start leading-tight">
              Return
              <span className="text-muted-foreground text-xs font-normal">Refund only</span>
            </span>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 justify-start gap-3"
            disabled={pending}
            onClick={() => finishReturn("exchange", false)}
          >
            <Repeat className="size-5" />
            <span className="flex flex-col items-start leading-tight">
              Exchange
              <span className="text-muted-foreground text-xs font-normal">Swapped for another item</span>
            </span>
          </Button>
          <Button
            size="lg"
            className="h-14 justify-start gap-3 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={pending}
            onClick={() => finishReturn("both", true)}
          >
            <ShoppingBag className="size-5" />
            <span className="flex flex-col items-start leading-tight">
              Both
              <span className="text-xs font-normal text-white/80">Returned &amp; bought more</span>
            </span>
          </Button>
        </div>
      </>
    );
  }

  if (step === "choice") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{target.name} — how did it go?</DialogTitle>
        </DialogHeader>
        <div className="flex gap-3">
          <Button
            size="lg"
            variant="outline"
            className="border-destructive/40 text-destructive h-14 flex-1"
            disabled={pending}
            onClick={() => setStep("reasons")}
          >
            <X className="mr-1.5 size-5" /> No sale
          </Button>
          <Button
            size="lg"
            className="h-14 flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={pending}
            onClick={() => {
              setStep("order");
              // Fetched on demand — never on the 45s refresh loop.
              void storeRecentOrders().then((res) => {
                setOrders(res.ok ? (res.data ?? []) : []);
              });
            }}
          >
            <Check className="mr-1.5 size-5" /> Sold
          </Button>
        </div>
      </>
    );
  }

  if (step === "order") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{target.name} — which order?</DialogTitle>
          <DialogDescription>
            Link the Shopify order so the sale knows its client.
          </DialogDescription>
        </DialogHeader>
        {orders === null ? (
          <p className="text-muted-foreground py-4 text-sm">Loading orders…</p>
        ) : orders.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            Couldn&apos;t load orders right now — continue without linking.
          </p>
        ) : (
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {orders.map((o, i) => (
              <Button
                key={o.id}
                variant={i === 0 ? "default" : "outline"}
                size="lg"
                className="h-14 justify-start gap-2.5"
                disabled={pending}
                onClick={() => {
                  setOrder(o);
                  setStep("contact");
                }}
              >
                <Receipt className="size-4 shrink-0" />
                <span className="flex min-w-0 flex-col items-start leading-tight">
                  <span className="font-semibold tabular-nums">
                    {o.name} · ${o.net.toFixed(2)}
                  </span>
                  <span className="truncate text-xs font-normal opacity-80">
                    {o.createdAt.slice(11, 16)} ·{" "}
                    {o.customer?.name ?? "no customer on the order"}
                  </span>
                </span>
                {i === 0 && (
                  <span className="ml-auto shrink-0 text-xs opacity-80">latest</span>
                )}
              </Button>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          className="text-muted-foreground"
          disabled={pending}
          onClick={() => {
            setOrder(null);
            setStep("contact");
          }}
        >
          Skip — no order to link
        </Button>
      </>
    );
  }

  if (step === "contact") {
    const linkedOrder: FinishOrder | undefined = order
      ? {
          id: order.id,
          name: order.name,
          total: order.net,
          customer_id: order.customer?.id ?? null,
          customer_name: order.customer?.name ?? null,
          customer_email: order.customer?.email ?? null,
          customer_phone: order.customer?.phone ?? null,
        }
      : undefined;
    return (
      <>
        <DialogHeader>
          <DialogTitle>{target.name} — got contact?</DialogTitle>
          {order && (
            <DialogDescription className="tabular-nums">
              Linked to {order.name}
              {order.customer?.name ? ` · ${order.customer.name}` : ""}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex gap-3">
          <Button
            size="lg"
            variant="outline"
            className="h-14 flex-1"
            disabled={pending}
            onClick={() =>
              onSubmit(target.employeeId, {
                kind: "walkin",
                sold: true,
                got_contact: false,
                order: linkedOrder,
              })
            }
          >
            No
          </Button>
          <Button
            size="lg"
            className="h-14 flex-1"
            disabled={pending}
            onClick={() =>
              onSubmit(target.employeeId, {
                kind: "walkin",
                sold: true,
                got_contact: true,
                order: linkedOrder,
              })
            }
          >
            Yes
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{target.name} — why no sale?</DialogTitle>
        <DialogDescription>Pick at least one reason.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-2">
        {NO_SALE_REASONS.map((r) => {
          const on = reasons.includes(r);
          return (
            <button
              key={r}
              type="button"
              disabled={pending}
              onClick={() => toggleReason(r)}
              className={cn(
                "rounded-full border px-4 py-2.5 text-sm font-medium transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {r}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-search">Products they wanted (optional)</Label>
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" />
          <Input
            id="product-search"
            className="pl-8"
            placeholder="Search the catalog…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
        {(hits.length > 0 || searching) && (
          <div className="flex max-h-40 flex-col overflow-y-auto rounded-md border">
            {searching && hits.length === 0 ? (
              <span className="text-muted-foreground p-2 text-sm">Searching…</span>
            ) : (
              hits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="hover:bg-muted p-2 text-left text-sm"
                  onClick={() => addProduct(p)}
                >
                  {p.title}
                  {p.sku && (
                    <span className="text-muted-foreground ml-2 text-xs tabular-nums">
                      {p.sku}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
        {products.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {products.map((p) => (
              <span
                key={p.id}
                className="bg-muted flex items-center gap-1 rounded-full px-3 py-1 text-xs"
              >
                {p.sku ? `${p.title} · ${p.sku}` : p.title}
                <button
                  type="button"
                  aria-label={`Remove ${p.title}`}
                  onClick={() => setProducts((cur) => cur.filter((x) => x.id !== p.id))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="no-sale-note">Note (optional)</Label>
        <Input
          id="no-sale-note"
          maxLength={300}
          placeholder="Anything else worth knowing"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <Button
        size="lg"
        className="h-12"
        disabled={pending || reasons.length === 0}
        onClick={() =>
          onSubmit(target.employeeId, {
            kind: "walkin",
            sold: false,
            got_contact: false,
            reasons,
            products: products.map((p) => ({ id: p.id, title: p.title, sku: p.sku })),
            note: note.trim() || undefined,
          })
        }
      >
        Log no sale
      </Button>
    </>
  );
}
