import { describe, expect, it } from "vitest";
import { finishSchema } from "@/lib/finish-schema";

describe("finishSchema", () => {
  it("accepts a sold walk-in", () => {
    expect(
      finishSchema.safeParse({ kind: "walkin", sold: true, got_contact: true }).success,
    ).toBe(true);
  });

  it("accepts a sold walk-in linking several orders", () => {
    const res = finishSchema.safeParse({
      kind: "walkin",
      sold: true,
      got_contact: false,
      orders: [
        { id: "1", name: "#1042", total: 120 },
        { id: "2", name: "#1051", total: 85, customer_name: "Maria" },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("accepts a no-sale with at least one reason", () => {
    const res = finishSchema.safeParse({
      kind: "walkin",
      sold: false,
      got_contact: false,
      reasons: ["No size"],
      products: [{ id: "123", title: "Runner shorts" }],
      note: "wanted the blue one",
      bought_before: "no",
      knew_brand: "yes",
    });
    expect(res.success).toBe(true);
  });

  it("accepts the 'No reason' chip and products carrying a SKU", () => {
    const res = finishSchema.safeParse({
      kind: "walkin",
      sold: false,
      got_contact: false,
      reasons: ["No reason"],
      products: [
        { id: "123", title: "Everyday Jog Pants", sku: "84939.S.0LJ104" },
        { id: "456", title: "Runner shorts", sku: null },
      ],
      bought_before: "unsure",
      knew_brand: "unsure",
    });
    expect(res.success).toBe(true);
  });

  it("rejects a no-sale without reasons", () => {
    expect(
      finishSchema.safeParse({ kind: "walkin", sold: false, got_contact: false }).success,
    ).toBe(false);
    expect(
      finishSchema.safeParse({
        kind: "walkin",
        sold: false,
        got_contact: false,
        reasons: [],
        bought_before: "no",
        knew_brand: "no",
      }).success,
    ).toBe(false);
  });

  // The two profile questions (0061) are asked before the reason and are
  // required on a no-sale — a half-answered pair must not reach the DB.
  const noSale = (extra: Record<string, unknown>) =>
    finishSchema.safeParse({
      kind: "walkin",
      sold: false,
      got_contact: false,
      reasons: ["No size"],
      ...extra,
    }).success;

  it("rejects a no-sale missing either profile answer", () => {
    expect(noSale({})).toBe(false);
    expect(noSale({ bought_before: "yes" })).toBe(false);
    expect(noSale({ knew_brand: "yes" })).toBe(false);
  });

  it.each(["yes", "no", "unsure"])("accepts '%s' for both profile answers", (a) => {
    expect(noSale({ bought_before: a, knew_brand: a })).toBe(true);
  });

  it("rejects a profile answer outside the three options", () => {
    expect(noSale({ bought_before: "maybe", knew_brand: "yes" })).toBe(false);
  });

  it("does not require the profile answers on a sold walk-in", () => {
    expect(
      finishSchema.safeParse({ kind: "walkin", sold: true, got_contact: false }).success,
    ).toBe(true);
  });

  it("accepts both return outcomes", () => {
    expect(finishSchema.safeParse({ kind: "return", sold: false }).success).toBe(true);
    expect(finishSchema.safeParse({ kind: "return", sold: true }).success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(finishSchema.safeParse({ kind: "other", sold: true }).success).toBe(false);
  });

  it("never throws on parse (the discriminatedUnion regression)", () => {
    // Zod v4 threw "Duplicate discriminator value" lazily on FIRST parse when
    // two union branches shared kind "walkin" — breaking every finish action.
    expect(() =>
      finishSchema.safeParse({ kind: "walkin", sold: false, got_contact: false }),
    ).not.toThrow();
  });
});
