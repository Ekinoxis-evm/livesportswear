"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Receipt,
  Repeat,
  Search,
  Send,
  ShoppingBag,
  Undo2,
  UserX,
  X,
} from "lucide-react";
import {
  storeSearchProducts,
  storeRecentOrders,
  storeThankYouLink,
} from "@/server/store-floor";
import { ANSWERS, type Answer, type FinishInput } from "@/lib/finish-schema";
import type { ProductHit, RecentOrder } from "@/lib/shopify";
import type { MessageLanguage } from "@/lib/message-languages";
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
  "Didn't fit well",
  "Just browsing",
  "Other reason",
  "No reason",
];

const THANKYOU_LANGS: { code: MessageLanguage; label: string }[] = [
  { code: "pt", label: "🇧🇷 PT" },
  { code: "en", label: "🇺🇸 EN" },
  { code: "es", label: "🇪🇸 ES" },
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
      <DialogContent className="max-w-lg">
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
  const [step, setStep] = useState<
    "choice" | "order" | "contact" | "thankyou" | "profile" | "reasons"
  >("choice");
  const [boughtBefore, setBoughtBefore] = useState<Answer | null>(null);
  const [knewBrand, setKnewBrand] = useState<Answer | null>(null);
  const [orders, setOrders] = useState<RecentOrder[] | null>(null);
  const [selected, setSelected] = useState<RecentOrder[]>([]);
  const [gotContact, setGotContact] = useState(false);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [waLoading, setWaLoading] = useState<MessageLanguage | null>(null);
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

  const toggleOrder = (o: RecentOrder) =>
    setSelected((cur) =>
      cur.some((x) => x.id === o.id) ? cur.filter((x) => x.id !== o.id) : [...cur, o],
    );

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
            onClick={() => setStep("profile")}
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
    const isOn = (o: RecentOrder) => selected.some((x) => x.id === o.id);
    const total = selected.reduce((s, o) => s + o.net, 0);
    return (
      <>
        <DialogHeader>
          <DialogTitle>{target.name} — which order(s)?</DialogTitle>
          <DialogDescription>
            Tap every order in this sale — a client who paid in two receipts links
            both, and the totals add up.
          </DialogDescription>
        </DialogHeader>
        {orders === null ? (
          <p className="text-muted-foreground py-4 text-sm">Loading orders…</p>
        ) : orders.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            Couldn&apos;t load orders right now — continue without linking.
          </p>
        ) : (
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {orders.map((o, i) => {
              const on = isOn(o);
              return (
                <Button
                  key={o.id}
                  variant={on ? "default" : "outline"}
                  size="lg"
                  className="h-14 justify-start gap-2.5"
                  disabled={pending}
                  onClick={() => toggleOrder(o)}
                >
                  {on ? (
                    <Check className="size-4 shrink-0" />
                  ) : (
                    <Receipt className="size-4 shrink-0" />
                  )}
                  <span className="flex min-w-0 flex-col items-start leading-tight">
                    <span className="font-semibold tabular-nums">
                      {o.name} · ${o.net.toFixed(2)}
                    </span>
                    <span className="truncate text-xs font-normal opacity-80">
                      {o.createdAt.slice(11, 16)} ·{" "}
                      {o.customer?.name ?? "no customer on the order"}
                    </span>
                  </span>
                  {!on && i === 0 && (
                    <span className="ml-auto shrink-0 text-xs opacity-80">latest</span>
                  )}
                </Button>
              );
            })}
          </div>
        )}
        {selected.length > 0 && (
          <p className="text-sm font-semibold tabular-nums">
            {selected.length} order{selected.length === 1 ? "" : "s"} · $
            {total.toFixed(2)}
          </p>
        )}
        {/* One explicit Continue, whichever path: an anonymous cash walk-in
            (0 orders) is legitimate and stays fast, but it's now a decision
            rather than the quiet ghost "Skip" that lost 59% of clients. */}
        <Button
          size="lg"
          className="h-14 justify-center gap-2.5"
          disabled={pending}
          onClick={() => setStep("contact")}
        >
          {selected.length === 0 ? (
            <>
              <UserX className="size-4 shrink-0" /> No customer on this sale
            </>
          ) : (
            <>Continue</>
          )}
        </Button>
      </>
    );
  }

  const primary = selected[0] ?? null;
  const finishSold = (got_contact: boolean) =>
    onSubmit(target.employeeId, {
      kind: "walkin",
      sold: true,
      got_contact,
      orders:
        selected.length > 0
          ? selected.map((o) => ({
              id: o.id,
              name: o.name,
              total: o.net,
              customer_id: o.customer?.id ?? null,
              customer_name: o.customer?.name ?? null,
            }))
          : undefined,
    });

  if (step === "contact") {
    // A sold order with a real customer can get a thank-you WhatsApp; anonymous
    // cash sales just record. (Pass `got` explicitly — setGotContact hasn't
    // flushed yet for the no-customer branch that submits immediately.)
    const proceed = (got: boolean) => {
      setGotContact(got);
      if (primary?.customer) setStep("thankyou");
      else finishSold(got);
    };
    return (
      <>
        <DialogHeader>
          <DialogTitle>{target.name} — got contact?</DialogTitle>
          {primary && (
            <DialogDescription className="tabular-nums">
              {selected.length > 1
                ? `Linked to ${selected.length} orders`
                : `Linked to ${primary.name}`}
              {primary.customer?.name ? ` · ${primary.customer.name}` : ""}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex gap-3">
          <Button
            size="lg"
            variant="outline"
            className="h-14 flex-1"
            disabled={pending}
            onClick={() => proceed(false)}
          >
            No
          </Button>
          <Button
            size="lg"
            className="h-14 flex-1"
            disabled={pending}
            onClick={() => proceed(true)}
          >
            Yes
          </Button>
        </div>
      </>
    );
  }

  if (step === "thankyou") {
    const pickLang = (lang: MessageLanguage) => {
      if (!primary) return;
      setWaLoading(lang);
      setWaUrl(null);
      void storeThankYouLink({ orderId: primary.id, language: lang }).then((res) => {
        setWaLoading(null);
        if (res.ok && res.data) setWaUrl(res.data.url);
        else if (!res.ok) toast.error(res.error);
      });
    };
    return (
      <>
        <DialogHeader>
          <DialogTitle>Send a thank-you?</DialogTitle>
          <DialogDescription>
            Pick a language to open WhatsApp with the message and the items
            {primary?.customer?.name ? ` for ${primary.customer.name}` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          {THANKYOU_LANGS.map((l) => (
            <Button
              key={l.code}
              size="lg"
              variant="outline"
              className="h-14 flex-1"
              disabled={waLoading !== null}
              onClick={() => pickLang(l.code)}
            >
              {waLoading === l.code ? "…" : l.label}
            </Button>
          ))}
        </div>
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => finishSold(gotContact)}
            className="bg-emerald-600 hover:bg-emerald-700 flex h-14 items-center justify-center gap-2 rounded-md text-base font-medium text-white"
          >
            <Send className="size-5" /> Open WhatsApp &amp; finish
          </a>
        )}
        <Button
          size="lg"
          variant="ghost"
          className="text-muted-foreground h-12"
          disabled={pending}
          onClick={() => finishSold(gotContact)}
        >
          Skip — just record the sale
        </Button>
      </>
    );
  }

  // Asked BEFORE the reason: a reason chip alone can't tell a returning client
  // who couldn't find her size from a stranger who'd never heard of the brand.
  if (step === "profile") {
    const ANSWER_LABEL: Record<Answer, string> = {
      yes: "Yes",
      no: "No",
      unsure: "Not sure",
    };
    const group = (
      label: string,
      value: Answer | null,
      set: (a: Answer) => void,
    ) => (
      <div className="flex flex-col gap-1.5">
        <Label>{label}</Label>
        <div className="flex gap-2">
          {ANSWERS.map((a) => (
            <button
              key={a}
              type="button"
              disabled={pending}
              onClick={() => set(a)}
              className={cn(
                "h-14 flex-1 rounded-md border text-sm font-medium transition-colors",
                value === a
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {ANSWER_LABEL[a]}
            </button>
          ))}
        </div>
      </div>
    );
    return (
      <>
        <DialogHeader>
          <DialogTitle>{target.name} — about this client</DialogTitle>
          <DialogDescription>
            Both answers help read the reason that follows. &ldquo;Not sure&rdquo; is
            fine — better than a guess.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {group("Had they bought from LIVE! before?", boughtBefore, setBoughtBefore)}
          {group("Did they already know LIVE!?", knewBrand, setKnewBrand)}
        </div>

        <Button
          size="lg"
          className="h-12"
          disabled={pending || boughtBefore === null || knewBrand === null}
          onClick={() => setStep("reasons")}
        >
          Continue
        </Button>
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
            bought_before: boughtBefore ?? undefined,
            knew_brand: knewBrand ?? undefined,
          })
        }
      >
        Log no sale
      </Button>
    </>
  );
}
