import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { BrandLogo } from "@/lib/emails/brand-logo";

export type TimeOffDecisionEmailProps = {
  employeeName: string;
  status: "approved" | "rejected";
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (equals startDate for a single day)
  note?: string; // optional admin note
  scheduleUrl: string; // public /s/{token} link
};

const accent = "#4a3a32";
const bg = "#c8b8a9";
const card = "#ffffff";
const border = "#b9a996";
const text = "#1d1d1d";
const muted = "#6b5e52";
const strip = "#ded2c4";
const positive = "#15803d";
const negative = "#b91c1c";

export function TimeOffDecisionEmail({
  employeeName,
  status,
  startDate,
  endDate,
  note,
  scheduleUrl,
}: TimeOffDecisionEmailProps): React.ReactElement {
  const approved = status === "approved";
  const statusColor = approved ? positive : negative;
  const dateRange = startDate === endDate ? startDate : `${startDate} – ${endDate}`;
  const heading = approved
    ? `Your time-off request for ${dateRange} is approved`
    : `Your time-off request for ${dateRange} was not approved`;
  const lead = approved
    ? `Hi ${employeeName}, your time-off request has been approved.`
    : `Hi ${employeeName}, your time-off request was reviewed and could not be approved.`;
  const badgeLabel = approved ? "Approved" : "Not approved";

  return (
    <Html lang="en">
      <Head />
      <Preview>{`Your time-off request for ${dateRange} is ${approved ? "approved" : "not approved"}`}</Preview>
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
          <BrandLogo />
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
            style={{ fontSize: "20px", fontWeight: 700, color: text, margin: "0 0 8px" }}
          >
            {heading}
          </Heading>

          <Text style={{ fontSize: "14px", color: muted, margin: "0 0 24px" }}>{lead}</Text>

          <Section
            style={{
              border: `1px solid ${border}`,
              borderLeft: `4px solid ${statusColor}`,
              borderRadius: "8px",
              backgroundColor: strip,
              padding: "16px",
              margin: "0 0 24px",
            }}
          >
            <Text
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: statusColor,
                fontWeight: 700,
                margin: "0 0 6px",
              }}
            >
              {badgeLabel}
            </Text>
            <Text
              style={{
                fontSize: "16px",
                color: text,
                fontVariantNumeric: "tabular-nums",
                margin: 0,
              }}
            >
              {dateRange}
            </Text>
          </Section>

          {note ? (
            <Section style={{ margin: "0 0 24px" }}>
              <Text
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: muted,
                  margin: "0 0 6px",
                }}
              >
                Note from your manager
              </Text>
              <Text style={{ fontSize: "14px", color: text, margin: 0 }}>{note}</Text>
            </Section>
          ) : null}

          <Button
            href={scheduleUrl}
            style={{
              boxSizing: "border-box",
              display: "block",
              width: "100%",
              backgroundColor: accent,
              color: "#f4f0f0",
              fontSize: "14px",
              fontWeight: 600,
              textAlign: "center",
              textDecoration: "none",
              padding: "12px 0",
              borderRadius: "8px",
            }}
          >
            View your schedule
          </Button>

          <Hr style={{ borderColor: border, margin: "24px 0 16px" }} />

          <Text style={{ fontSize: "12px", color: muted, margin: 0 }}>
            This link is personal to you. Keep it private.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default TimeOffDecisionEmail;
