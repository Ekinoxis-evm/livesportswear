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
  Row,
  Column,
  Section,
  Text,
} from "@react-email/components";
import { BrandLogo } from "@/lib/emails/brand-logo";

export type SchedulePublishedEmailProps = {
  employeeName: string;
  locationName: string;
  weekRange: string;
  shifts: { date: string; label: string; time: string; coworkers: string }[];
  scheduleUrl: string;
};

const accent = "#4a3a32";
const bg = "#c8b8a9";
const card = "#ffffff";
const border = "#b9a996";
const text = "#1d1d1d";
const muted = "#6b5e52";
const strip = "#ded2c4";

export function SchedulePublishedEmail({
  employeeName,
  locationName,
  weekRange,
  shifts,
  scheduleUrl,
}: SchedulePublishedEmailProps): React.ReactElement {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`Your ${locationName} schedule for ${weekRange} is published`}</Preview>
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
            Your schedule for {weekRange} is published
          </Heading>

          <Text style={{ fontSize: "14px", color: muted, margin: "0 0 24px" }}>
            Hi {employeeName}, your shifts at {locationName} for {weekRange} are ready.
          </Text>

          {shifts.length === 0 ? (
            <Text style={{ fontSize: "14px", color: muted, margin: "0 0 24px" }}>
              You have no shifts scheduled this week.
            </Text>
          ) : (
            <Section
              style={{
                border: `1px solid ${border}`,
                borderRadius: "8px",
                overflow: "hidden",
                margin: "0 0 24px",
              }}
            >
              <Row style={{ backgroundColor: strip }}>
                {(
                  [
                    ["Date", "24%"],
                    ["Shift", "20%"],
                    ["Time", "24%"],
                    ["With", "32%"],
                  ] as const
                ).map(([heading, width]) => (
                  <Column key={heading} style={{ padding: "10px 16px", width }}>
                    <Text
                      style={{
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: muted,
                        margin: 0,
                      }}
                    >
                      {heading}
                    </Text>
                  </Column>
                ))}
              </Row>
              {shifts.map((shift, i) => (
                <Row
                  key={`${shift.date}-${shift.time}-${i}`}
                  style={{ borderTop: `1px solid ${border}` }}
                >
                  <Column style={{ padding: "12px 16px", width: "24%", verticalAlign: "top" }}>
                    <Text style={{ fontSize: "14px", color: text, margin: 0 }}>
                      {shift.date}
                    </Text>
                  </Column>
                  <Column style={{ padding: "12px 16px", width: "20%", verticalAlign: "top" }}>
                    <Text style={{ fontSize: "14px", color: muted, margin: 0 }}>
                      {shift.label}
                    </Text>
                  </Column>
                  <Column style={{ padding: "12px 16px", width: "24%", verticalAlign: "top" }}>
                    <Text
                      style={{
                        fontSize: "14px",
                        color: text,
                        fontVariantNumeric: "tabular-nums",
                        margin: 0,
                      }}
                    >
                      {shift.time}
                    </Text>
                  </Column>
                  <Column style={{ padding: "12px 16px", width: "32%", verticalAlign: "top" }}>
                    <Text style={{ fontSize: "14px", color: shift.coworkers ? text : muted, margin: 0 }}>
                      {shift.coworkers || "—"}
                    </Text>
                  </Column>
                </Row>
              ))}
            </Section>
          )}

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

export default SchedulePublishedEmail;
