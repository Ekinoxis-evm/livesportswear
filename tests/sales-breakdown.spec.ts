import { describe, expect, it } from "vitest";
import {
  orderBreakdown,
  sumBreakdowns,
  zeroBreakdown,
} from "@/lib/sales-breakdown";

describe("orderBreakdown", () => {
  it("decomposes a discounted order: gross − discounts = net when nothing returned", () => {
    const b = orderBreakdown({
      total_line_items_price: "140.00",
      total_discounts: "84.00",
      subtotal_price: "56.00",
      current_subtotal_price: "56.00",
    });
    expect(b).toEqual({ gross: 140, discounts: 84, returns: 0, net: 56 });
  });

  it("attributes a partial refund to returns", () => {
    const b = orderBreakdown({
      total_line_items_price: "200.00",
      total_discounts: "20.00",
      subtotal_price: "180.00",
      current_subtotal_price: "130.00",
    });
    expect(b.returns).toBe(50);
    expect(b.net).toBe(130);
  });

  it("treats missing fields as zero", () => {
    expect(orderBreakdown({ current_subtotal_price: "10.00" })).toEqual({
      gross: 0,
      discounts: 0,
      returns: -10,
      net: 10,
    });
  });
});

describe("sumBreakdowns", () => {
  it("sums and rounds to cents", () => {
    const total = sumBreakdowns([
      { gross: 10.11, discounts: 0.1, returns: 0, net: 10.01 },
      { gross: 10.1, discounts: 0.1, returns: 0.2, net: 9.8 },
    ]);
    expect(total).toEqual({ gross: 20.21, discounts: 0.2, returns: 0.2, net: 19.81 });
  });

  it("returns zeros for an empty list", () => {
    expect(sumBreakdowns([])).toEqual(zeroBreakdown());
  });
});
