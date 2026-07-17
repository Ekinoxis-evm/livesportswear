import { describe, expect, it } from "vitest";
import {
  buildPushPlan,
  buildPushCsv,
  pushTotals,
  type PushBookRow,
  type PushVariantInput,
  type PushCsvRow,
} from "@/lib/inventory-push";

const book = (overrides: Partial<PushBookRow> = {}): PushBookRow => ({
  barcode: "790",
  sku: "84939.S",
  product_title: "Jog Pants",
  variant_title: "S",
  qty: 4,
  unknown: false,
  ...overrides,
});

const variant = (overrides: Partial<PushVariantInput> = {}): PushVariantInput => ({
  barcode: "790",
  sku: "84939.S",
  productTitle: "Jog Pants",
  variantTitle: "S",
  inventoryItemId: "gid://shopify/InventoryItem/1",
  tracked: true,
  onHand: 2,
  ...overrides,
});

describe("buildPushPlan", () => {
  it("splits corrections, in-sync, and skipped rows and keeps the invariant", () => {
    const rows = [
      book(), // delta +2
      book({ barcode: "791", qty: 2 }), // in sync
      book({ barcode: "999", unknown: true }), // unknown
      book({ barcode: "800" }), // no variant
    ];
    const plan = buildPushPlan(rows, [
      variant(),
      variant({ barcode: "791", onHand: 2 }),
    ]);
    expect(plan.corrections).toHaveLength(1);
    expect(plan.inSync).toBe(1);
    expect(plan.skippedUnknown).toEqual(["999"]);
    expect(plan.skippedNoVariant).toEqual(["800"]);
    expect(
      plan.corrections.length +
        plan.inSync +
        plan.skippedUnknown.length +
        plan.skippedNoVariant.length,
    ).toBe(rows.length);
  });

  it("computes delta as book minus current Shopify on hand", () => {
    const plan = buildPushPlan([book({ qty: 4 })], [variant({ onHand: 7 })]);
    expect(plan.corrections[0]).toMatchObject({
      book_qty: 4,
      shopify_qty: 7,
      delta: -3,
      inventory_item_id: "gid://shopify/InventoryItem/1",
    });
  });

  it("skips untracked variants", () => {
    const plan = buildPushPlan([book()], [variant({ tracked: false })]);
    expect(plan.corrections).toHaveLength(0);
    expect(plan.skippedNoVariant).toEqual(["790"]);
  });

  it("skips a barcode that appears on two catalog variants (ambiguous write)", () => {
    const plan = buildPushPlan(
      [book()],
      [variant(), variant({ inventoryItemId: "gid://shopify/InventoryItem/2" })],
    );
    expect(plan.corrections).toHaveLength(0);
    expect(plan.skippedNoVariant).toEqual(["790"]);
  });

  it("treats a missing inventory level at the location as 0 on hand", () => {
    const plan = buildPushPlan([book({ qty: 4 })], [variant({ onHand: null })]);
    expect(plan.corrections[0]).toMatchObject({ shopify_qty: 0, delta: 4 });
  });

  it("computes delta against negative Shopify on hand as-is", () => {
    const plan = buildPushPlan([book({ qty: 2 })], [variant({ onHand: -1 })]);
    expect(plan.corrections[0]).toMatchObject({ shopify_qty: -1, delta: 3 });
  });

  it("sorts corrections by absolute delta then product title", () => {
    const plan = buildPushPlan(
      [
        book({ barcode: "1", product_title: "Bra", qty: 3 }),
        book({ barcode: "2", product_title: "Ankle Socks", qty: 1 }),
        book({ barcode: "3", product_title: "Tee", qty: 12 }),
      ],
      [
        variant({ barcode: "1", onHand: 5 }),
        variant({ barcode: "2", onHand: 3 }),
        variant({ barcode: "3", onHand: 2 }),
      ],
    );
    expect(plan.corrections.map((c) => c.product_title)).toEqual([
      "Tee",
      "Ankle Socks",
      "Bra",
    ]);
  });

  it("counts catalog variants absent from the book without emitting corrections", () => {
    const plan = buildPushPlan([book()], [variant(), variant({ barcode: "555" })]);
    expect(plan.notInBook).toBe(1);
    expect(plan.corrections).toHaveLength(1);
  });
});

describe("pushTotals", () => {
  it("ignores excluded rows and splits units up and down", () => {
    const totals = pushTotals([
      { delta: 5, excluded: false },
      { delta: -2, excluded: false },
      { delta: 9, excluded: true },
    ]);
    expect(totals).toEqual({ rows: 2, unitsUp: 5, unitsDown: 2 });
  });
});

describe("buildPushCsv", () => {
  it("writes the header, totals line, and marks excluded rows", () => {
    const rows: PushCsvRow[] = [
      {
        barcode: "790",
        sku: "84939.S",
        product_title: "Jog Pants",
        variant_title: "S",
        inventory_item_id: "gid://shopify/InventoryItem/1",
        book_qty: 4,
        shopify_qty: 2,
        delta: 2,
        excluded: false,
      },
      {
        barcode: "791",
        sku: null,
        product_title: "Tee",
        variant_title: "M",
        inventory_item_id: "gid://shopify/InventoryItem/2",
        book_qty: 1,
        shopify_qty: 3,
        delta: -2,
        excluded: true,
      },
    ];
    const csv = buildPushCsv("Miami Lincoln Road", rows);
    expect(csv).toContain("Shopify push draft — Miami Lincoln Road");
    expect(csv).toContain("1 rows to write · 2 units up · 0 units down");
    expect(csv).toContain("Jog Pants,S,84939.S,790,4,2,2,");
    expect(csv).toContain("Tee,M,,791,1,3,-2,excluded");
  });
});
