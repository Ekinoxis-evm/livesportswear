import { describe, it, expect } from "vitest";
import {
  conversionRate,
  totals,
  byPerson,
  formatPct,
  formatDuration,
  type ConversionInput,
} from "@/lib/conversion";
import { businessDate } from "@/lib/business-date";

const ev = (
  employee_id: string,
  sold: boolean,
  got_contact = false,
): ConversionInput => ({ employee_id, sold, got_contact });

describe("conversionRate", () => {
  it("is zero when nobody was attended", () => {
    expect(conversionRate(0, 0)).toBe(0);
  });

  it("is sold over attended otherwise", () => {
    expect(conversionRate(3, 12)).toBe(0.25);
  });
});

describe("totals", () => {
  it("counts attended, sold, contacts and derives rates", () => {
    const t = totals([ev("a", true, true), ev("a", false), ev("a", true, false)]);
    expect(t).toEqual({
      attended: 3,
      sold: 2,
      contacts: 1,
      conversion: 2 / 3,
      contactRate: 0.5,
      returns: 0,
      returnExtraSales: 0,
      avgServedSeconds: null,
    });
  });

  it("returns zeroed rates for an empty day", () => {
    expect(totals([])).toEqual({
      attended: 0,
      sold: 0,
      contacts: 0,
      conversion: 0,
      contactRate: 0,
      returns: 0,
      returnExtraSales: 0,
      avgServedSeconds: null,
    });
  });

  it("keeps returns out of the walk-in conversion rate", () => {
    const t = totals([
      ev("a", true),
      ev("a", false),
      { employee_id: "a", sold: false, got_contact: false, kind: "return" },
      { employee_id: "a", sold: true, got_contact: false, kind: "return" },
    ]);
    expect(t.attended).toBe(2);
    expect(t.sold).toBe(1);
    expect(t.conversion).toBe(0.5); // unchanged by the two returns
    expect(t.returns).toBe(2);
    expect(t.returnExtraSales).toBe(1); // the return that bought more
  });

  it("treats events without a kind as walk-ins", () => {
    const t = totals([ev("a", true), { ...ev("a", true), kind: null }]);
    expect(t.attended).toBe(2);
    expect(t.returns).toBe(0);
  });

  it("averages served time over timed events only (walk-ins + returns)", () => {
    const t = totals([
      { employee_id: "a", sold: true, got_contact: false, served_seconds: 120 },
      { employee_id: "a", sold: false, got_contact: false, served_seconds: 240 },
      { employee_id: "a", sold: false, got_contact: false, kind: "return", served_seconds: 60 },
      { employee_id: "a", sold: false, got_contact: false }, // untimed — excluded
    ]);
    expect(t.avgServedSeconds).toBe(140); // (120+240+60)/3
  });

  it("avgServedSeconds is null when nothing is timed", () => {
    expect(totals([ev("a", true)]).avgServedSeconds).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats m:ss and h:mm:ss, dash for null", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(252)).toBe("4:12");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("byPerson", () => {
  it("groups per employee and orders by sold then attended", () => {
    const rows = byPerson([
      ev("a", false),
      ev("b", true),
      ev("b", true, true),
      ev("a", false),
      ev("a", false),
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b", "a"]);
    expect(rows[0]).toMatchObject({ employeeId: "b", attended: 2, sold: 2 });
    expect(rows[1]).toMatchObject({ employeeId: "a", attended: 3, sold: 0 });
  });
});

describe("formatPct", () => {
  it("rounds to a whole percent", () => {
    expect(formatPct(2 / 3)).toBe("67%");
    expect(formatPct(0)).toBe("0%");
  });
});

describe("businessDate", () => {
  it("uses the location-local calendar day, not UTC", () => {
    // 02:30 UTC on the 2nd is still the 1st in New York (UTC-5/-4).
    const m = new Date("2026-06-02T02:30:00Z");
    expect(businessDate("America/New_York", m)).toBe("2026-06-01");
    expect(businessDate("UTC", m)).toBe("2026-06-02");
  });
});
