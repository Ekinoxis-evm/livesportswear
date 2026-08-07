import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from "@react-email/components";

export type DayReportRow = {
  name: string;
  attended: number;
  sold: number;
  conversionPct: string;
  contacts: number;
  orders: number;
  gross: string; // formatted currency (full-price sales value — the headline)
  net: string; // formatted currency (net sales attributed to this rep)
  avgTicket: string; // formatted currency (gross / orders)
  hours: number;
};

export type DayReportEmailProps = {
  locationName: string;
  businessDate: string; // YYYY-MM-DD
  closedByName: string;
  note?: string | null; // the closer's own words, already cleaned (cleanNote)
  attended: number;
  sold: number;
  contacts: number;
  conversionPct: string;
  avgTimeLabel?: string; // avg time per client (m:ss)
  returns?: number;
  returnExtraSales?: number;
  shopifySales?: string | null; // formatted NET sales, when POS keys are connected
  grossSales?: string | null;
  discounts?: string | null; // pre-formatted with the leading minus
  returnsValue?: string | null; // pre-formatted with the leading minus
  taxes?: string | null; // pre-formatted with the leading plus
  totalSales?: string | null; // formatted net + taxes (Shopify "Total sales" — the register)
  shopifyOrders?: number | null;
  cashReceived?: string | null;
  cardReceived?: string | null;
  refunds?: string | null; // "-$41.73 · 1" when any happened
  perPerson: DayReportRow[];
};

const accent = "#4a3a32";
const bg = "#c8b8a9";
const card = "#ffffff";
const border = "#b9a996";
const text = "#1d1d1d";
const muted = "#6b5e52";
const strip = "#ded2c4";

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <Column style={{ padding: "0 8px" }}>
      <Text
        style={{
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: muted,
          margin: "0 0 4px",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: "22px",
          fontWeight: 700,
          color: text,
          fontVariantNumeric: "tabular-nums",
          margin: 0,
        }}
      >
        {value}
      </Text>
    </Column>
  );
}

function MetricRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <Row style={{ margin: "0 0 6px" }}>
      <Column
        style={{
          fontSize: emphasized ? "14px" : "13px",
          color: emphasized ? text : muted,
          fontWeight: emphasized ? 700 : 400,
        }}
      >
        {label}
      </Column>
      <Column
        style={{
          fontSize: emphasized ? "16px" : "14px",
          color: text,
          fontWeight: emphasized ? 700 : 400,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Column>
    </Row>
  );
}

export function DayReportEmail({
  locationName,
  businessDate,
  closedByName,
  note,
  attended,
  sold,
  contacts,
  conversionPct,
  avgTimeLabel,
  returns,
  returnExtraSales,
  shopifySales,
  grossSales,
  discounts,
  returnsValue,
  taxes,
  totalSales,
  shopifyOrders,
  cashReceived,
  cardReceived,
  refunds,
  perPerson,
}: DayReportEmailProps): React.ReactElement {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`${locationName} — ${businessDate}: ${sold}/${attended} (${conversionPct})`}</Preview>
      <Body
        style={{
          backgroundColor: bg,
          color: text,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
          margin: 0,
          padding: "24px 0",
        }}
      >
        <Container
          style={{
            maxWidth: "560px",
            margin: "0 auto",
            backgroundColor: card,
            border: `1px solid ${border}`,
            borderRadius: "12px",
            padding: "32px",
          }}
        >
          <Text
            style={{
              fontSize: "24px",
              fontWeight: 800,
              letterSpacing: "0.02em",
              color: accent,
              margin: "0 0 24px",
            }}
          >
            LIVE
          </Text>

          <Heading
            as="h1"
            style={{ fontSize: "20px", fontWeight: 700, color: text, margin: "0 0 4px" }}
          >
            Daily report — {locationName}
          </Heading>
          <Text
            style={{ fontSize: "13px", color: muted, margin: note ? "0 0 16px" : "0 0 24px" }}
          >
            {businessDate} · closed by {closedByName}
          </Text>

          {note && (
            <Section
              style={{
                backgroundColor: strip,
                borderLeft: `3px solid ${accent}`,
                borderRadius: "8px",
                padding: "12px 14px",
                margin: "0 0 24px",
              }}
            >
              <Text
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: muted,
                  margin: "0 0 6px",
                }}
              >
                Note from the store
              </Text>
              {/* pre-wrap so the line breaks of a pasted message survive; React
                  Email escapes the text, so a paste can't inject markup. */}
              <Text
                style={{
                  fontSize: "14px",
                  color: text,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                }}
              >
                {note}
              </Text>
            </Section>
          )}

          <Section style={{ margin: "0 0 8px" }}>
            <Row>
              <KPI label="Attended" value={String(attended)} />
              <KPI label="Sold" value={String(sold)} />
              <KPI label="Conversion" value={conversionPct} />
              <KPI label="Contacts" value={String(contacts)} />
              {avgTimeLabel && avgTimeLabel !== "—" && (
                <KPI label="Avg time" value={avgTimeLabel} />
              )}
            </Row>
          </Section>

          {returns != null && returns > 0 && (
            <Text style={{ fontSize: "13px", color: muted, margin: "8px 0 0" }}>
              Returns: <span style={{ color: text }}>{returns}</span>
              {" · "}
              <span style={{ color: text }}>{returnExtraSales ?? 0}</span> converted to an
              extra sale
            </Text>
          )}

          {shopifySales != null ? (
            <Section style={{ margin: "16px 0 0" }}>
              {grossSales != null && (
                <MetricRow label="Gross sales" value={grossSales} />
              )}
              {discounts != null && (
                <MetricRow label="Discounts" value={discounts} />
              )}
              {returnsValue != null && (
                <MetricRow label="Returns" value={returnsValue} />
              )}
              <Hr style={{ borderColor: border, margin: "8px 0" }} />
              <MetricRow label="Net sales" value={shopifySales} />
              {taxes != null && <MetricRow label="Taxes" value={taxes} />}
              <Hr style={{ borderColor: border, margin: "8px 0" }} />
              <MetricRow label="Total sales" value={totalSales ?? shopifySales} emphasized />
              {shopifyOrders != null && (
                <MetricRow label="Orders" value={String(shopifyOrders)} />
              )}
              {(cashReceived != null || cardReceived != null || refunds != null) && (
                <Hr style={{ borderColor: border, margin: "8px 0" }} />
              )}
              {cashReceived != null && (
                <MetricRow label="Cash received" value={cashReceived} />
              )}
              {cardReceived != null && (
                <MetricRow label="Card received" value={cardReceived} />
              )}
              {refunds != null && <MetricRow label="Refunds" value={refunds} />}
            </Section>
          ) : (
            <Text style={{ fontSize: "12px", color: muted, margin: "8px 0 0" }}>
              Shopify POS sales will appear here once the store keys are connected.
            </Text>
          )}

          <Hr style={{ borderColor: border, margin: "24px 0 16px" }} />

          <Text
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: muted,
              margin: "0 0 8px",
            }}
          >
            By team member
          </Text>
          {perPerson.length === 0 ? (
            <Text style={{ fontSize: "14px", color: muted, margin: 0 }}>
              No activity was logged today.
            </Text>
          ) : (
            <>
              <Row style={{ margin: "0 0 6px" }}>
                <Column style={{ fontSize: "12px", color: muted, width: "34%" }}>
                  Team member
                </Column>
                <Column style={{ fontSize: "12px", color: muted, textAlign: "right" }}>
                  Sales
                </Column>
                <Column style={{ fontSize: "12px", color: muted, textAlign: "right" }}>
                  Avg ticket
                </Column>
                <Column style={{ fontSize: "12px", color: muted, textAlign: "right" }}>
                  Sold/Att
                </Column>
              </Row>
              {perPerson.map((p) => (
                <Row key={p.name} style={{ margin: "0 0 6px" }}>
                  <Column style={{ fontSize: "14px", color: text, width: "34%" }}>{p.name}</Column>
                  <Column
                    style={{
                      fontSize: "14px",
                      color: text,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {p.gross}
                    <span style={{ display: "block", fontSize: "11px", color: muted }}>
                      {p.net} net
                    </span>
                  </Column>
                  <Column
                    style={{
                      fontSize: "14px",
                      color: text,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {p.avgTicket}
                  </Column>
                  <Column
                    style={{
                      fontSize: "14px",
                      color: muted,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {p.sold}/{p.attended} · {p.conversionPct}
                  </Column>
                </Row>
              ))}
            </>
          )}

          <Hr style={{ borderColor: border, margin: "24px 0 12px" }} />
          <Text style={{ fontSize: "13px", color: text, margin: "0 0 4px" }}>
            Sent by {closedByName}
          </Text>
          <Text style={{ fontSize: "12px", color: muted, margin: 0 }}>
            Full detail — per-employee sales, every client and check-in — is attached as an
            Excel workbook (.xlsx). A CSV and PDF are attached too.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DayReportEmail;
