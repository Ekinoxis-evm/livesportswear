import { describe, expect, it } from "vitest";
import {
  retakePatch,
  type ExistingEvent,
  type RetakeOrder,
} from "@/lib/retake";

const event = (e: Partial<ExistingEvent> = {}): ExistingEvent => ({
  sold: false,
  got_contact: false,
  order_total: null,
  shopify_order_id: null,
  shopify_order_name: null,
  shopify_customer_id: null,
  customer_name: null,
  customer_email: null,
  customer_phone: null,
  linked_orders: null,
  ...e,
});

const order = (o: Partial<RetakeOrder> = {}): RetakeOrder => ({
  id: "9001",
  name: "#1043",
  total: 89,
  ...o,
});

describe("retakePatch — bought", () => {
  it("turns a no-sale attendance into a sale", () => {
    const patch = retakePatch(event({ sold: false }), {
      sold: true,
      orders: [order({ total: 89 })],
    });
    expect(patch).toMatchObject({ sold: true, order_total: 89 });
  });

  it("ADDS to an attendance that already had a sale — never replaces it", () => {
    // Overwriting would silently lose the first sale.
    const patch = retakePatch(
      event({ sold: true, order_total: 45, shopify_order_id: "1", shopify_order_name: "#1012" }),
      { sold: true, orders: [order({ id: "2", total: 89 })] },
    );
    expect(patch.order_total).toBe(134);
    expect(patch.linked_orders).toHaveLength(2);
  });

  it("dedupes when the same order is re-picked", () => {
    const patch = retakePatch(
      event({ order_total: 45, shopify_order_id: "1", shopify_order_name: "#1012" }),
      { sold: true, orders: [order({ id: "1", total: 45 })] },
    );
    expect(patch.order_total).toBe(45);
    expect(patch.linked_orders).toHaveLength(1);
  });

  it("sums several orders linked in one re-take", () => {
    const patch = retakePatch(event(), {
      sold: true,
      orders: [order({ id: "1", total: 20 }), order({ id: "2", total: 30 })],
    });
    expect(patch.order_total).toBe(50);
    expect(patch.linked_orders).toHaveLength(2);
  });

  it("handles a numeric-string prior total from the DB", () => {
    const patch = retakePatch(event({ order_total: "45.50", shopify_order_id: "1" }), {
      sold: true,
      orders: [order({ id: "2", total: 10.25 })],
    });
    expect(patch.order_total).toBe(55.75);
  });

  it("marks sold even when no order is linked", () => {
    const patch = retakePatch(event({ sold: false }), { sold: true, orders: [] });
    expect(patch).toMatchObject({ sold: true, order_total: 0 });
  });

  it("links the new order and its customer", () => {
    const patch = retakePatch(event(), {
      sold: true,
      orders: [order({ customer_id: "c1", customer_name: "Maria", customer_email: "m@x.com" })],
    });
    expect(patch).toMatchObject({
      shopify_order_name: "#1043",
      shopify_customer_id: "c1",
      customer_name: "Maria",
      customer_email: "m@x.com",
    });
  });

  it("never blanks contact captured on the first visit", () => {
    const patch = retakePatch(
      event({ customer_name: "Maria", customer_phone: "+13055551234", order_total: 10, shopify_order_id: "1" }),
      { sold: true, orders: [order({ customer_name: null, customer_phone: null })] },
    );
    expect(patch.customer_name).toBe("Maria");
    expect(patch.customer_phone).toBe("+13055551234");
  });

  it("keeps the earlier order reference and total when the re-take links none", () => {
    const patch = retakePatch(
      event({ shopify_order_id: "1", shopify_order_name: "#1012", order_total: 45 }),
      { sold: true, orders: [] },
    );
    expect(patch).toMatchObject({ shopify_order_name: "#1012", order_total: 45, sold: true });
  });
});

describe("retakePatch — no sale", () => {
  it("re-logs a return visit without forcing a sale", () => {
    const patch = retakePatch(event({ sold: false }), { sold: false });
    expect(patch.sold).toBe(false);
  });

  it("never downgrades a real sale", () => {
    const patch = retakePatch(event({ sold: true }), { sold: false });
    expect(patch.sold).toBe(true);
  });

  it("captures contact obtained on this visit", () => {
    const patch = retakePatch(event({ got_contact: false }), {
      sold: false,
      gotContact: true,
    });
    expect(patch.got_contact).toBe(true);
  });

  it("leaves the money and orders untouched", () => {
    const patch = retakePatch(event({ order_total: 45 }), { sold: false });
    expect(patch.order_total).toBeUndefined();
    expect(patch.linked_orders).toBeUndefined();
  });
});
