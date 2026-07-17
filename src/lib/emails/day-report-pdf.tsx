import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  productLabel,
  type ReportCheckin,
  type ReportEvent,
} from "@/lib/day-report-csv";
import type { DayReportTotals } from "@/lib/day-report-xml";
import { workedHours, stampStatus } from "@/lib/attendance";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Printable Daily Report (rendered server-side with renderToBuffer in
 * conversion-core). Same source rows as the CSV/XML; money is NET sales.
 */

const BRAND = "#1f5240";

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#1d1d1d" },
  header: {
    backgroundColor: BRAND,
    color: "#f4f0f0",
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
  },
  brand: { fontSize: 8, textTransform: "uppercase", opacity: 0.8 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
  moneyRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  moneyBox: {
    flexGrow: 1,
    border: `1 solid #dcd6cf`,
    borderRadius: 4,
    padding: 8,
  },
  moneyLabel: { fontSize: 7, color: "#6b655e", textTransform: "uppercase" },
  moneyValue: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 },
  statLine: { marginBottom: 12, color: "#3d3a36" },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    marginTop: 6,
  },
  table: { border: `1 solid #dcd6cf`, borderRadius: 4 },
  tr: {
    flexDirection: "row",
    borderBottom: `1 solid #eee9e2`,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  th: { fontFamily: "Helvetica-Bold", color: "#6b655e", fontSize: 7 },
  cell: { flexGrow: 0, flexShrink: 0 },
});

function Money({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.moneyBox}>
      <Text style={s.moneyLabel}>{label}</Text>
      <Text style={s.moneyValue}>{value}</Text>
    </View>
  );
}

export function DayReportPdf({
  storeName,
  businessDateLabel,
  currency,
  tz,
  totals,
  money,
  events,
  checkins,
}: {
  storeName: string;
  businessDateLabel: string;
  currency: string;
  tz: string;
  totals: DayReportTotals;
  money: (v: number | null) => string;
  events: ReportEvent[];
  checkins: ReportCheckin[];
}) {
  const time = (iso: string) => formatInTimeZone(new Date(iso), tz, "HH:mm");
  void currency;

  const eventCols = [110, 55, 45, 45, 150, 45] as const;
  const checkinCols = [120, 45, 45, 45, 55, 70, 70] as const;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.brand}>LIVE! · Daily Report</Text>
          <Text style={s.title}>
            {storeName} · {businessDateLabel}
          </Text>
        </View>

        <View style={s.moneyRow}>
          <Money label="Sales value" value={money(totals.grossSales)} />
          <Money
            label="Discounts"
            value={totals.discounts ? `−${money(totals.discounts)}` : money(totals.discounts)}
          />
          <Money
            label="Returns"
            value={
              totals.returnsValue ? `−${money(totals.returnsValue)}` : money(totals.returnsValue)
            }
          />
          <Money label="Net sales" value={money(totals.netSales)} />
        </View>
        <View style={s.moneyRow}>
          <Money label="Cash received" value={money(totals.cashNet)} />
          <Money label="Card" value={money(totals.cardNet)} />
          <Money
            label={`Refunds${totals.refundsCount ? ` (${totals.refundsCount})` : ""}`}
            value={money(totals.refundsTotal)}
          />
        </View>

        <Text style={s.statLine}>
          Attended {totals.attended} · Sold {totals.sold} · Conversion{" "}
          {totals.conversionPct} · Contacts {totals.contacts} · Returns{" "}
          {totals.returns}
          {totals.orders != null ? ` · Orders ${totals.orders}` : ""}
        </Text>

        <Text style={s.sectionTitle}>Client events ({events.length})</Text>
        <View style={s.table}>
          <View style={s.tr}>
            {["Employee", "Time · kind", "Result", "Contact", "Reasons / products / note", ""].map(
              (h, i) => (
                <Text key={h + i} style={[s.th, s.cell, { width: eventCols[i] }]}>
                  {h}
                </Text>
              ),
            )}
          </View>
          {events.map((e, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={[s.cell, { width: eventCols[0] }]}>{e.employeeName}</Text>
              <Text style={[s.cell, { width: eventCols[1] }]}>
                {time(e.attended_at)} · {e.kind ?? "walkin"}
              </Text>
              <Text style={[s.cell, { width: eventCols[2] }]}>
                {e.sold ? "sold" : "no sale"}
              </Text>
              <Text style={[s.cell, { width: eventCols[3] }]}>
                {e.got_contact ? "yes" : "no"}
              </Text>
              <Text style={[s.cell, { width: eventCols[4] }]}>
                {[
                  (e.reasons ?? []).join("; "),
                  (e.products ?? []).map(productLabel).join("; "),
                  e.note ?? "",
                ]
                  .filter(Boolean)
                  .join(" — ")}
              </Text>
              <Text style={[s.cell, { width: eventCols[5] }]} />
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Hours &amp; breaks ({checkins.length})</Text>
        <View style={s.table}>
          <View style={s.tr}>
            {["Employee", "In", "Out", "Hours", "Break min", "Entry", "Exit"].map((h, i) => (
              <Text key={h} style={[s.th, s.cell, { width: checkinCols[i] }]}>
                {h}
              </Text>
            ))}
          </View>
          {checkins.map((c, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={[s.cell, { width: checkinCols[0] }]}>{c.employeeName}</Text>
              <Text style={[s.cell, { width: checkinCols[1] }]}>{time(c.arrived_at)}</Text>
              <Text style={[s.cell, { width: checkinCols[2] }]}>
                {c.left_at ? time(c.left_at) : ""}
              </Text>
              <Text style={[s.cell, { width: checkinCols[3] }]}>
                {workedHours(c.arrived_at, c.left_at) ?? ""}
              </Text>
              <Text style={[s.cell, { width: checkinCols[4] }]}>
                {c.breakMinutes && c.breakMinutes > 0 ? c.breakMinutes : ""}
              </Text>
              <Text style={[s.cell, { width: checkinCols[5] }]}>
                {stampStatus({ at: c.arrived_at, validatedAt: c.entry_validated_at, self: c.entry_self })}
              </Text>
              <Text style={[s.cell, { width: checkinCols[6] }]}>
                {stampStatus({
                  at: c.left_at,
                  validatedAt: c.exit_validated_at,
                  self: c.exit_self,
                  missed: c.exit_missed,
                })}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
