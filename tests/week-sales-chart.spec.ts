import { describe, expect, it } from "vitest";
import { buildWeekChart, type DayInput, type StaffMeta } from "@/lib/week-sales-chart";

const bd = (net: number) => ({ gross: net, discounts: 0, returns: 0, net });
const meta = new Map<string, StaffMeta>([
  ["1", { name: "Ana", color: "#f00" }],
  ["2", { name: "Ben", color: "#00f" }],
]);
const OTHER = "#999";

const day = (date: string, total: number, staff: [string, number][]): DayInput => ({
  date,
  total: bd(total),
  staff: staff.map(([id, n]) => [id, bd(n)]),
});

describe("buildWeekChart", () => {
  it("builds a rep segment per attributing staff, colours from meta", () => {
    const c = buildWeekChart([day("2026-05-04", 100, [["1", 60], ["2", 40]])], meta, OTHER);
    const segs = c.days[0].segments;
    expect(segs.map((s) => [s.label, s.color, s.net])).toEqual([
      ["Ana", "#f00", 60],
      ["Ben", "#00f", 40],
    ]);
  });

  it("adds an Other cap for the unattributed remainder so the bar = store total", () => {
    const c = buildWeekChart([day("2026-05-04", 100, [["1", 70]])], meta, OTHER);
    const segs = c.days[0].segments;
    expect(segs[segs.length - 1]).toMatchObject({ key: "__other__", label: "Other", net: 30 });
    expect(c.days[0].total).toBe(100);
    expect(c.legend.some((l) => l.key === "__other__")).toBe(true);
  });

  it("omits Other when every dollar is attributed", () => {
    const c = buildWeekChart([day("2026-05-04", 100, [["1", 60], ["2", 40]])], meta, OTHER);
    expect(c.days[0].segments.some((s) => s.key === "__other__")).toBe(false);
    expect(c.legend.some((l) => l.key === "__other__")).toBe(false);
  });

  it("weekMax is the largest single-day total, for scaling", () => {
    const c = buildWeekChart(
      [day("2026-05-04", 100, [["1", 100]]), day("2026-05-05", 250, [["2", 250]])],
      meta,
      OTHER,
    );
    expect(c.weekMax).toBe(250);
    expect(c.weekTotal).toBe(350);
  });

  it("keeps a stable rep order across days so colours line up", () => {
    const c = buildWeekChart(
      [day("2026-05-04", 100, [["2", 40], ["1", 60]])],
      meta,
      OTHER,
    );
    expect(c.days[0].segments.map((s) => s.label)).toEqual(["Ana", "Ben"]);
  });

  it("an unmapped staff id falls back to Other colour/label", () => {
    const c = buildWeekChart([day("2026-05-04", 50, [["99", 50]])], meta, OTHER);
    expect(c.days[0].segments[0]).toMatchObject({ label: "Other staff", color: OTHER });
  });

  it("has no sales when the week is empty", () => {
    const c = buildWeekChart([day("2026-05-04", 0, [])], meta, OTHER);
    expect(c.hasSales).toBe(false);
  });
});
