import { describe, expect, it } from "vitest";
import { buildDayReportXml } from "@/lib/day-report-xml";

const base = {
  businessDate: "2026-07-16",
  storeName: "Miami Lincoln Road",
  currency: "USD",
  tz: "America/New_York",
  totals: {
    netSales: 1176,
    orders: 9,
    cashNet: 279.27,
    cardNet: 896.73,
    refundsTotal: -41.73,
    refundsCount: 1,
    attended: 22,
    sold: 12,
    conversionPct: "55%",
    contacts: 8,
    returns: 1,
  },
};

describe("buildDayReportXml", () => {
  it("renders totals, events, and checkins with store-local times", () => {
    const xml = buildDayReportXml({
      ...base,
      events: [
        {
          employeeName: "Maryna",
          attended_at: "2026-07-16T15:30:00Z", // 11:30 EDT
          sold: true,
          got_contact: true,
        },
      ],
      checkins: [
        {
          employeeName: "Maryna",
          arrived_at: "2026-07-16T13:30:00Z",
          left_at: "2026-07-16T21:30:00Z",
          entry_validated_at: "2026-07-16T13:30:00Z",
          entry_self: false,
          exit_validated_at: "2026-07-16T21:30:00Z",
          exit_self: false,
          breakMinutes: 25,
        },
      ],
    });
    expect(xml).toContain('<dayReport date="2026-07-16" store="Miami Lincoln Road"');
    expect(xml).toContain("<netSales>1176</netSales>");
    expect(xml).toContain("<cashReceived>279.27</cashReceived>");
    expect(xml).toContain('<refunds count="1">-41.73</refunds>');
    expect(xml).toContain('<event time="11:30" employee="Maryna" kind="walkin" sold="true"');
    expect(xml).toContain('in="09:30" out="17:30" hours="8" breakMinutes="25"');
  });

  it("escapes XML-hostile characters everywhere", () => {
    const xml = buildDayReportXml({
      ...base,
      events: [
        {
          employeeName: 'A & B <"C">',
          attended_at: "2026-07-16T15:30:00Z",
          sold: false,
          got_contact: false,
          reasons: ["No size"],
          note: "wanted <blue> & \"red\"",
        },
      ],
      checkins: [],
    });
    expect(xml).toContain("A &amp; B &lt;&quot;C&quot;&gt;");
    expect(xml).toContain("wanted &lt;blue&gt; &amp; &quot;red&quot;");
    expect(xml).not.toContain("<blue>");
  });

  it("renders empty sections and null money as self-closing tags", () => {
    const xml = buildDayReportXml({
      ...base,
      totals: { ...base.totals, netSales: null, cashNet: null, refundsTotal: null },
      events: [],
      checkins: [],
    });
    expect(xml).toContain("<netSales/>");
    expect(xml).toContain("<cashReceived/>");
    expect(xml).toContain('<clientEvents count="0">');
  });
});
