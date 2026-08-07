import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { DayReportEmail } from "@/lib/emails/day-report";
import { cleanNote } from "@/lib/report-note";

const base = {
  locationName: "Miami",
  businessDate: "Fri · Aug 7",
  closedByName: "Ana",
  attended: 12,
  sold: 5,
  contacts: 3,
  conversionPct: "42%",
  perPerson: [],
};

describe("DayReportEmail — the closer's note", () => {
  it("renders a pasted multi-line note", async () => {
    const note = cleanNote("POS down 3–4pm.\r\n\r\n\r\nTwo sales rang up late.");
    const html = await render(DayReportEmail({ ...base, note }));
    expect(html).toContain("Note from the store");
    expect(html).toContain("POS down 3–4pm.");
    expect(html).toContain("Two sales rang up late.");
  });

  it("keeps the line breaks of a pasted note", async () => {
    const html = await render(DayReportEmail({ ...base, note: "one\ntwo" }));
    expect(html).toMatch(/pre-wrap/);
  });

  it("escapes markup rather than rendering it", async () => {
    const html = await render(
      DayReportEmail({ ...base, note: "<script>alert(1)</script>" }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("renders no note block when there is no note", async () => {
    const html = await render(DayReportEmail({ ...base, note: null }));
    expect(html).not.toContain("Note from the store");
  });
});
