import { describe, it, expect } from "vitest";
import { finishResultFrom, type FinishParsed } from "@/lib/finish-result";

const noSale: FinishParsed = {
  kind: "walkin",
  sold: false,
  got_contact: false,
  reasons: ["Size not available"],
  bought_before: "yes",
  knew_brand: "no",
};

describe("finishResultFrom", () => {
  it("carries the profile answers through on a no-sale walk-in", () => {
    const r = finishResultFrom(noSale);
    expect(r.bought_before).toBe("yes");
    expect(r.knew_brand).toBe("no");
  });

  it.each(["yes", "no", "unsure"] as const)("carries %s through unchanged", (a) => {
    const r = finishResultFrom({ ...noSale, bought_before: a, knew_brand: a });
    expect(r.bought_before).toBe(a);
    expect(r.knew_brand).toBe(a);
  });

  it("keeps the reason and the note on a no-sale", () => {
    const r = finishResultFrom({ ...noSale, note: "wanted a refund" });
    expect(r.reasons).toEqual(["Size not available"]);
    expect(r.note).toBe("wanted a refund");
  });

  it("drops no-sale-only fields when the walk-in bought", () => {
    const r = finishResultFrom({
      kind: "walkin",
      sold: true,
      got_contact: true,
      reasons: ["stale"],
      note: "stale",
      bought_before: "yes",
      knew_brand: "yes",
      orders: [{ id: "1", name: "#1001", total: 10 }],
    });
    expect(r.reasons).toBeUndefined();
    expect(r.note).toBeUndefined();
    expect(r.bought_before).toBeUndefined();
    expect(r.knew_brand).toBeUndefined();
    expect(r.orders).toHaveLength(1);
  });

  it("keeps orders only on a sold walk-in", () => {
    const r = finishResultFrom({ ...noSale, orders: [{ id: "1", name: "#1", total: 5 }] });
    expect(r.orders).toBeUndefined();
  });

  it("maps a return: no contact, keeps the label, no profile answers", () => {
    const r = finishResultFrom({ kind: "return", sold: false, return_type: "exchange" });
    expect(r.return_type).toBe("exchange");
    expect(r.got_contact).toBe(false);
    expect(r.bought_before).toBeUndefined();
  });

  it("does not put a return_type on a walk-in", () => {
    expect(finishResultFrom(noSale).return_type).toBeUndefined();
  });

  it("carries the open-client id on both kinds", () => {
    expect(finishResultFrom({ ...noSale, client_id: "c1" }).client_id).toBe("c1");
    expect(
      finishResultFrom({ kind: "return", sold: false, client_id: "c2" }).client_id,
    ).toBe("c2");
  });

  // The 0061 regression: every field the schema validates must reach the row.
  // Answers were required on this path for a month and written as NULL because
  // the caller rebuilt the object by hand and forgot two keys.
  it("forwards every validated no-sale field", () => {
    const r = finishResultFrom({
      ...noSale,
      products: [{ id: "p1", title: "Legging", sku: "REF.M.BLK" }],
      note: "n",
    });
    for (const k of ["reasons", "products", "note", "bought_before", "knew_brand"] as const) {
      expect(r[k], `${k} was dropped`).toBeDefined();
    }
  });
});
