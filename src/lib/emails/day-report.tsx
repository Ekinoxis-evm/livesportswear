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
};

export type DayReportEmailProps = {
  locationName: string;
  businessDate: string; // YYYY-MM-DD
  closedByName: string;
  attended: number;
  sold: number;
  contacts: number;
  conversionPct: string;
  shopifySales?: string | null; // formatted money, when POS keys are connected
  shopifyOrders?: number | null;
  perPerson: DayReportRow[];
};

const accent = "#ffffff";
const bg = "#0a0a0a";
const card = "#141414";
const border = "#2a2a2a";
const text = "#ededed";
const muted = "#a1a1a1";

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

export function DayReportEmail({
  locationName,
  businessDate,
  closedByName,
  attended,
  sold,
  contacts,
  conversionPct,
  shopifySales,
  shopifyOrders,
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
          <Text style={{ fontSize: "13px", color: muted, margin: "0 0 24px" }}>
            {businessDate} · closed by {closedByName}
          </Text>

          <Section style={{ margin: "0 0 8px" }}>
            <Row>
              <KPI label="Attended" value={String(attended)} />
              <KPI label="Sold" value={String(sold)} />
              <KPI label="Conversion" value={conversionPct} />
              <KPI label="Contacts" value={String(contacts)} />
            </Row>
          </Section>

          {shopifySales != null ? (
            <Text style={{ fontSize: "13px", color: muted, margin: "8px 0 0" }}>
              Shopify POS sales: <span style={{ color: text }}>{shopifySales}</span>
              {shopifyOrders != null && (
                <>
                  {" "}
                  · <span style={{ color: text }}>{shopifyOrders}</span> orders
                </>
              )}
            </Text>
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
              No clients were logged today.
            </Text>
          ) : (
            perPerson.map((p) => (
              <Row key={p.name} style={{ margin: "0 0 6px" }}>
                <Column style={{ fontSize: "14px", color: text }}>{p.name}</Column>
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
            ))
          )}

          <Hr style={{ borderColor: border, margin: "24px 0 12px" }} />
          <Text style={{ fontSize: "12px", color: muted, margin: 0 }}>
            Full detail (every client and check-in) is attached as CSV.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DayReportEmail;
