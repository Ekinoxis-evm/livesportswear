import { describe, expect, it } from "vitest";
import { retakePatch, type ExistingEvent, type RetakeOrder } from "@/lib/retake";

const event = (e: Partial<ExistingEvent> = {}): ExistingEvent => ({
  sold: false,
  order_total: null,
  shopify_order_id: null,
  shopify_order_name: null,
  shopify_customer_id: null,
  customer_name: null,
  customer_email: null,
  customer_phone: null,
  ...e,
});

const order = (o: Partial<RetakeOrder> = {}): RetakeOrder => ({
  id: "9001",
  name: "#1043",
  total: 89,
  ...o,
});

describe("retakePatch", () => {
  it("turns a no-sale attendance into a sale", () => {
    const patch = retakePatch(event({ sold: false }), order({ total: 89 }));
    expect(patch).toMatchObject({ sold: true, order_total: 89 });
  });

  it("ADDS to an attendance that already had a sale — never replaces it", () => {
    // The case that matters: overwriting would silently lose the first sale.
    const patch = retakePatch(
      event({ sold: true, order_total: 45 }),
      order({ total: 89 }),
    );
    expect(patch.order_total).toBe(134);
  });

  it("handles a numeric-string total from the DB", () => {
    const patch = retakePatch(event({ order_total: "45.50" }), order({ total: 10.25 }));
    expect(patch.order_total).toBe(55.75);
  });

  it("rounds to the cent rather than drifting", () => {
    const patch = retakePatch(event({ order_total: 0.1 }), order({ total: 0.2 }));
    expect(patch.order_total).toBe(0.3);
  });

  it("still marks sold when no order is linked", () => {
    const patch = retakePatch(event({ sold: false }), null);
    expect(patch).toMatchObject({ sold: true, order_total: 0 });
  });

  it("links the new order and its customer", () => {
    const patch = retakePatch(
      event(),
      order({ customer_id: "c1", customer_name: "Maria", customer_email: "m@x.com" }),
    );
    expect(patch).toMatchObject({
      shopify_order_name: "#1043",
      shopify_customer_id: "c1",
      customer_name: "Maria",
      customer_email: "m@x.com",
    });
  });

  it("never blanks contact captured on the first visit", () => {
    const patch = retakePatch(
      event({ customer_name: "Maria", customer_phone: "+13055551234" }),
      order({ customer_name: null, customer_phone: null }),
    );
    expect(patch.customer_name).toBe("Maria");
    expect(patch.customer_phone).toBe("+13055551234");
  });

  it("keeps the earlier order reference when the re-take links none", () => {
    const patch = retakePatch(
      event({ shopify_order_id: "1", shopify_order_name: "#1012", order_total: 45 }),
      null,
    );
    expect(patch).toMatchObject({
      shopify_order_name: "#1012",
      order_total: 45,
      sold: true,
    });
  });
});
