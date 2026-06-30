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
  Text,
} from "@react-email/components";

export type InviteEmailProps = {
  employeeName: string;
  actionUrl: string; // Supabase invite action link (sets password on first visit)
  locationName?: string;
};

const accent = "#ffffff";
const bg = "#0a0a0a";
const card = "#141414";
const border = "#2a2a2a";
const text = "#ededed";
const muted = "#a1a1a1";

export function InviteEmail({
  employeeName,
  actionUrl,
  locationName,
}: InviteEmailProps): React.ReactElement {
  const where = locationName ? ` at ${locationName}` : "";
  return (
    <Html lang="en">
      <Head />
      <Preview>Set up your Live team portal access</Preview>
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
            style={{ fontSize: "20px", fontWeight: 700, color: text, margin: "0 0 8px" }}
          >
            You&apos;re invited to the team portal
          </Heading>

          <Text style={{ fontSize: "14px", color: muted, margin: "0 0 24px" }}>
            Hi {employeeName}, you&apos;ve been added to the Live team portal{where}.
            Set your password to see your schedule, hours, and daily sales tools.
          </Text>

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
