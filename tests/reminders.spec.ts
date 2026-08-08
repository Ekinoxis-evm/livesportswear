import { describe, expect, it } from "vitest";
import { dueSlot, reminderTimes, toMinutes } from "@/lib/reminders";

const perfume = { startTime: "10:00", endTime: "21:00", intervalMinutes: 180 };

describe("reminderTimes", () => {
  it("stops at the last step that fits inside the end", () => {
    // The end is a bound, not a slot: 22:00 would be past 21:00.
    expect(reminderTimes(perfume)).toEqual(["10:00", "13:00", "16:00", "19:00"]);
  });

  it("reaches the end when a step lands exactly on it", () => {
    expect(
      reminderTimes({ startTime: "09:00", endTime: "21:00", intervalMinutes: 180 }),
    ).toEqual(["09:00", "12:00", "15:00", "18:00", "21:00"]);
  });

  it("accepts a time with seconds, as Postgres returns it", () => {
    expect(
      reminderTimes({ startTime: "10:00:00", endTime: "13:00:00", intervalMinutes: 180 }),
    ).toEqual(["10:00", "13:00"]);
  });

  it("gives a single slot when start equals end", () => {
    expect(
      reminderTimes({ startTime: "10:00", endTime: "10:00", intervalMinutes: 60 }),
    ).toEqual(["10:00"]);
  });

  it("returns nothing when the end is before the start", () => {
    expect(
      reminderTimes({ startTime: "21:00", endTime: "10:00", intervalMinutes: 60 }),
    ).toEqual([]);
  });

  it("refuses an interval below the minimum rather than looping", () => {
    expect(
      reminderTimes({ startTime: "10:00", endTime: "21:00", intervalMinutes: 0 }),
    ).toEqual([]);
  });

  it("returns nothing for an unparseable time", () => {
    expect(
      reminderTimes({ startTime: "nope", endTime: "21:00", intervalMinutes: 60 }),
    ).toEqual([]);
  });
});

describe("dueSlot", () => {
  const times = reminderTimes(perfume); // 10 · 13 · 16 · 19

  it("is quiet before the first slot", () => {
    expect(dueSlot(times, "09:59")).toBeNull();
  });

  it("fires the moment a slot arrives", () => {
    expect(dueSlot(times, "10:00")).toBe("10:00");
  });

  it("keeps nagging while the slot is unacknowledged", () => {
    expect(dueSlot(times, "12:30")).toBe("10:00");
  });

  it("goes quiet once the due slot is acknowledged", () => {
    expect(dueSlot(times, "12:30", ["10:00"])).toBeNull();
  });

  it("returns only the latest missed slot, never a backlog", () => {
    // An iPad asleep since opening must not stack four popups.
    expect(dueSlot(times, "19:30")).toBe("19:00");
  });

  it("re-arms at the next slot after the previous was done", () => {
    expect(dueSlot(times, "13:00", ["10:00"])).toBe("13:00");
  });

  it("stays quiet after the last slot is done", () => {
    expect(dueSlot(times, "23:00", ["19:00"])).toBeNull();
  });

  it("has nothing to show without a schedule", () => {
    expect(dueSlot([], "13:00")).toBeNull();
  });
});

describe("toMinutes", () => {
  it("rejects an out-of-range clock time", () => {
    expect(toMinutes("25:00")).toBeNull();
    expect(toMinutes("10:75")).toBeNull();
  });
});
