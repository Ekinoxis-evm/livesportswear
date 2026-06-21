import ical from "ical-generator";

export type FeedShift = {
  id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM or HH:MM:SS (location-local)
  end_time: string;
  templateName: string | null;
};

export type FeedInput = {
  employeeName: string;
  location: { name: string; address: string | null; timezone: string };
  shifts: FeedShift[];
};

const withSeconds = (t: string) => (t.length === 5 ? `${t}:00` : t);

/**
 * Builds a per-employee ICS subscription feed. Pure — no DB, no Resend.
 * Times stay in the location's local timezone; the calendar client resolves
 * TZID. We never convert to UTC by hand. See .claude/skills/ics-feed-skill.
 */
export function buildEmployeeFeed(input: FeedInput): string {
  const cal = ical({
    prodId: { company: "Live Active Wear", product: "Schedule", language: "EN" },
    name: `Live — ${input.employeeName}`,
    timezone: input.location.timezone,
  });

  for (const shift of input.shifts) {
    cal.createEvent({
      id: `shift-${shift.id}@live.app`,
      start: `${shift.date}T${withSeconds(shift.start_time)}`,
      end: `${shift.date}T${withSeconds(shift.end_time)}`,
      timezone: input.location.timezone,
      summary: `${shift.templateName ?? "Shift"} · ${input.location.name}`,
      location: input.location.address ?? undefined,
    });
  }

  return cal.toString();
}
