import { describe, expect, it } from "vitest";
import { finishSchema } from "@/lib/finish-schema";

describe("finishSchema", () => {
  it("accepts a sold walk-in", () => {
    expect(
      finishSchema.safeParse({ kind: "walkin", sold: true, got_contact: true }).success,
    ).toBe(true);
  });

  it("accepts a no-sale with at least one reason", () => {
    const res = finishSchema.safeParse({
      kind: "walkin",
      sold: false,
      got_contact: false,
      reasons: ["No size"],
      products: [{ id: "123", title: "Runner shorts" }],
      note: "wanted the blue one",
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
      }).success,
    ).toBe(false);
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
