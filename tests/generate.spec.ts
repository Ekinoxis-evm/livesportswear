import { describe, expect, it } from "vitest";
import { fillSchedule, type MixerInput, type MixerEmployee, type MixerSlot } from "@/lib/scheduling/generate";

const DAYS = [
  "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
  "2026-08-07", "2026-08-08", "2026-08-09",
];
const SLOTS: MixerSlot[] = [
  { key: "morning", templateId: "t-am", start: "09:30", end: "17:30", headcount: 1 },
  { key: "evening", templateId: "t-pm", start: "14:30", end: "22:30", headcount: 1 },
];
const emp = (id: string, maxDays = 5, daysOff = 2): MixerEmployee => ({ id, maxDays, daysOff });
const base = (over: Partial<MixerInput> = {}): MixerInput => ({
  days: DAYS,
  employees: [emp("a"), emp("b"), emp("c")],
  slots: SLOTS,
  timeOff: [],
  existing: [],
  seed: 1,
  ...over,
});

const daysWorkedOf = (r: { assignments: { employeeId: string; date: string }[] }, id: string) =>
  new Set(r.assignments.filter((a) => a.employeeId === id).map((a) => a.date)).size;

describe("fillSchedule", () => {
  it("fills every cell to its headcount when there's capacity, with no gaps", () => {
    const r = fillSchedule(base()); // 3 people (cap 5 each = 15) vs 14 cells
    expect(r.assignments).toHaveLength(14);
    expect(r.gaps).toEqual([]);
  });

  it("never exceeds a person's cap (min of max days and 7 − days off)", () => {
    const r = fillSchedule(base({ employees: [emp("a", 3, 2)] })); // cap 3, 14 cells
    expect(daysWorkedOf(r, "a")).toBe(3);
    expect(r.assignments).toHaveLength(3);
    const short = r.gaps.reduce((s, g) => s + g.short, 0);
    expect(short).toBe(11); // 14 − 3
  });

  it("uses the tighter of max days vs required days off", () => {
    // maxDays 6 but daysOff 5 → cap = 7 − 5 = 2.
    const r = fillSchedule(base({ employees: [emp("a", 6, 5)] }));
    expect(daysWorkedOf(r, "a")).toBe(2);
  });

  it("never assigns someone on an approved time-off day", () => {
    const r = fillSchedule(base({
      employees: [emp("a")],
      timeOff: [{ employeeId: "a", date: "2026-08-05" }],
    }));
    expect(r.assignments.some((x) => x.employeeId === "a" && x.date === "2026-08-05")).toBe(false);
  });

  it("gives at most one shift per person per day", () => {
    // One person, both slots on each day → only one slot filled per day.
    const r = fillSchedule(base({ employees: [emp("a", 7, 0)] }));
    for (const d of DAYS) {
      const onDay = r.assignments.filter((x) => x.date === d);
      expect(onDay.length).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for the same seed and re-rolls for a new one", () => {
    const a = fillSchedule(base({ seed: 7 }));
    const b = fillSchedule(base({ seed: 7 }));
    expect(a).toEqual(b);
    const c = fillSchedule(base({ seed: 8 }));
    expect(c.assignments).toHaveLength(14); // still a full, valid week
  });

  it("counts existing shifts (Complete mode): a full cell is left alone", () => {
    const r = fillSchedule(base({
      employees: [emp("a"), emp("b")],
      existing: [{ employeeId: "a", date: "2026-08-03", slotKey: "morning" }],
    }));
    // The Mon-morning cell (headcount 1) is already full → not reassigned.
    expect(
      r.assignments.some((x) => x.date === "2026-08-03" && x.slotKey === "morning"),
    ).toBe(false);
  });

  it("fills only the remaining seats when a cell is partly staffed", () => {
    const twoUp: MixerSlot[] = [{ ...SLOTS[0], headcount: 2 }];
    const r = fillSchedule({
      ...base(),
      slots: twoUp,
      employees: [emp("a", 7, 0), emp("b", 7, 0)], // enough capacity to fill every cell
      existing: [{ employeeId: "a", date: "2026-08-03", slotKey: "morning" }],
    });
    const monMorning = r.assignments.filter(
      (x) => x.date === "2026-08-03" && x.slotKey === "morning",
    );
    expect(monMorning).toHaveLength(1); // one seat left, "a" already in it
    expect(monMorning[0].employeeId).toBe("b");
  });

  it("ignores slots with zero headcount", () => {
    const r = fillSchedule(base({ slots: [{ ...SLOTS[0], headcount: 0 }] }));
    expect(r.assignments).toEqual([]);
    expect(r.gaps).toEqual([]);
  });

  it("spreads days roughly evenly across the team", () => {
    const r = fillSchedule(base()); // 14 assignments / 3 people
    const counts = ["a", "b", "c"].map((id) => daysWorkedOf(r, id));
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});
