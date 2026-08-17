import { describe, it, expect } from "vitest";
import { resolveViewDay, shiftDay, MAX_DAYS_BACK } from "@/lib/day-window";

const TODAY = "2026-08-17";

describe("shiftDay", () => {
  it("steps across a month boundary", () => {
    expect(shiftDay("2026-09-01", -1)).toBe("2026-08-31");
    expect(shiftDay("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("steps across a leap day", () => {
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("resolveViewDay", () => {
  it("defaults to today, with no next", () => {
    const w = resolveViewDay(undefined, TODAY);
    expect(w.date).toBe(TODAY);
    expect(w.next).toBeNull();
    expect(w.prev).toBe("2026-08-16");
    expect(w.isToday).toBe(true);
  });

  it("shows a past day and offers both directions", () => {
    const w = resolveViewDay("2026-08-12", TODAY);
    expect(w.date).toBe("2026-08-12");
    expect(w.prev).toBe("2026-08-11");
    expect(w.next).toBe("2026-08-13");
    expect(w.isToday).toBe(false);
  });

  // A rep must never be able to tap into a day that hasn't happened — it would
  // render an empty floor that reads as a catastrophically bad day.
  it("clamps a future date to today", () => {
    expect(resolveViewDay("2099-01-01", TODAY).date).toBe(TODAY);
  });

  it("clamps beyond the window to the oldest reachable day", () => {
    const oldest = shiftDay(TODAY, -MAX_DAYS_BACK);
    const w = resolveViewDay("2024-01-01", TODAY);
    expect(w.date).toBe(oldest);
    expect(w.prev).toBeNull();
    expect(w.next).toBe(shiftDay(oldest, 1));
  });

  it.each(["", "nonsense", "2026-8-1", "2026-13-45"])(
    "falls back to today for %s",
    (raw) => {
      expect(resolveViewDay(raw, TODAY).date).toBe(TODAY);
    },
  );
});
