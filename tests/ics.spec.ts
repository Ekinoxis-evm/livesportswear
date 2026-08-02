import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildEmployeeFeed } from "@/lib/ical";

describe("buildEmployeeFeed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-05-26T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("emits a calendar with one TZID-anchored VEVENT per shift", () => {
    const feed = buildEmployeeFeed({
      employeeName: "Mara Díaz",
      location: {
        name: "Miami Lincoln Road",
        address: "123 Lincoln Rd",
        timezone: "America/New_York",
      },
      shifts: [
        {
          id: "s1",
          date: "2025-05-26",
          start_time: "09:30:00",
          end_time: "17:30:00",
          templateName: "Morning",
        },
      ],
    });

    expect(feed).toContain("PRODID:-//Live Active Wear//Schedule//EN");
    expect(feed).toContain("X-WR-CALNAME:Live — Mara Díaz");
    expect(feed).toContain("X-WR-TIMEZONE:America/New_York");
    expect(feed).toContain("UID:shift-s1@live.app");
    expect(feed).toContain("DTSTART;TZID=America/New_York:20250526T093000");
    expect(feed).toContain("DTEND;TZID=America/New_York:20250526T173000");
    expect(feed).toContain("SUMMARY:Morning · Miami Lincoln Road");
  });

  it("produces an empty calendar when there are no shifts", () => {
    const feed = buildEmployeeFeed({
      employeeName: "Empty",
      location: { name: "Store", address: null, timezone: "America/Bogota" },
      shifts: [],
    });
    expect(feed).toContain("BEGIN:VCALENDAR");
    expect(feed).not.toContain("BEGIN:VEVENT");
  });

  it("names the coworkers on the shift in the event description", () => {
    const feed = buildEmployeeFeed({
      employeeName: "Mara Díaz",
      location: { name: "Store", address: null, timezone: "America/Bogota" },
      shifts: [
        {
          id: "s1",
          date: "2025-05-26",
          start_time: "09:30:00",
          end_time: "17:30:00",
          templateName: "Morning",
          coworkers: ["Ana", "Bruno"],
        },
      ],
    });
    expect(feed).toContain("DESCRIPTION:With: Ana\\, Bruno");
  });

  it("omits the description when nobody shares the shift", () => {
    const feed = buildEmployeeFeed({
      employeeName: "Solo",
      location: { name: "Store", address: null, timezone: "America/Bogota" },
      shifts: [
        {
          id: "s1",
          date: "2025-05-26",
          start_time: "09:30:00",
          end_time: "17:30:00",
          templateName: "Morning",
          coworkers: [],
        },
      ],
    });
    expect(feed).not.toContain("DESCRIPTION");
  });
});
