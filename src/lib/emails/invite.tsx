import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type InviteEmailProps = {
  employeeName: string;
  actionUrl: string; // Supabase invite action link (sets password on first visit)
  appUrl: string; // where they sign in afterwards
  locationName?: string;
  role?: "employee" | "admin";
};

const accent = "#ffffff";
const violet = "#7c5cff";
const bg = "#0a0a0a";
const card = "#141414";
const inner = "#0f0f0f";
const border = "#2a2a2a";
const text = "#ededed";
const muted = "#a1a1a1";

const EMPLOYEE_FEATURES = [
  "See your weekly schedule — yours and the whole store's — and add shifts to your calendar in one tap",
  "Log every customer you help and watch your conversion rate update live",
  "Request days off before the weekly cut-off",
  "Track your hours, sales and commission",
];

const ADMIN_FEATURES = [
  "Build weekly schedules by shift and publish them to the team",
  "Review and approve time-off requests",
  "Track store conversion, monthly sales goals and ad performance",
];

function Feature({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: "14px", color: text, margin: "0 0 10px", lineHeight: "1.4" }}>
      <span style={{ color: violet, fontWeight: 700, marginRight: "8px" }}>•</span>
      {children}
    </Text>
  );
}

export function InviteEmail({
  employeeName,
  actionUrl,
  appUrl,
  locationName,
  role = "employee",
}: InviteEmailProps): React.ReactElement {
  const where = locationName ? ` at ${locationName}` : "";
  const host = appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const features = role === "admin" ? ADMIN_FEATURES : EMPLOYEE_FEATURES;
  const lead =
    role === "admin"
      ? `Hi ${employeeName}, you've been added as an admin on LIVE!${where} — the team's home for scheduling and store performance.`
      : `Hi ${employeeName}, you've been added to the LIVE! team portal${where} — your home for your schedule, hours and daily sales.`;

  return (
    <Html lang="en">
      <Head />
      <Preview>Set up your LIVE! team portal access</Preview>
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
            LIVE!
          </Text>

          <Heading
            as="h1"
            style={{ fontSize: "20px", fontWeight: 700, color: text, margin: "0 0 8px" }}
          >
            Welcome to the team portal
          </Heading>

          <Text style={{ fontSize: "14px", color: muted, margin: "0 0 24px", lineHeight: "1.5" }}>
            {lead}
          </Text>

          <Section
            style={{
              backgroundColor: inner,
              border: `1px solid ${border}`,
              borderRadius: "8px",
              padding: "20px 20px 10px",
              margin: "0 0 24px",
            }}
          >
            <Text
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: muted,
                margin: "0 0 14px",
              }}
            >
              What you can do
            </Text>
            {features.map((f) => (
              <Feature key={f}>{f}</Feature>
            ))}
          </Section>

          <Button
            href={actionUrl}
            style={{
              boxSizing: "border-box",
              display: "block",
              width: "100%",
              backgroundColor: accent,
              color: "#0a0a0a",
              fontSize: "14px",
              fontWeight: 600,
              textAlign: "center",
              textDecoration: "none",
              padding: "12px 0",
              borderRadius: "8px",
            }}
          >
            Set your password
          </Button>

          <Text style={{ fontSize: "13px", color: muted, margin: "16px 0 0", textAlign: "center" }}>
            Then sign in anytime at{" "}
            <Link href={`${appUrl}/login`} style={{ color: violet, textDecoration: "none" }}>
              {host}
            </Link>
          </Text>

          <Hr style={{ borderColor: border, margin: "24px 0 16px" }} />

          <Text style={{ fontSize: "12px", color: muted, margin: 0 }}>
            This link is personal to you and expires soon. If you didn&apos;t expect
            this, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InviteEmail;
