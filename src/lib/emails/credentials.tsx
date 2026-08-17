import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { BrandLogo } from "@/lib/emails/brand-logo";

export type CredentialsEmailProps = {
  name: string;
  email: string;
  password: string;
  loginUrl: string;
  isAdmin: boolean;
};

const bg = "#c8b8a9";
const card = "#ffffff";
const border = "#b9a996";
const text = "#1d1d1d";
const muted = "#6b5e52";

export function CredentialsEmail({
  name,
  email,
  password,
  loginUrl,
  isAdmin,
}: CredentialsEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Live access is ready — sign in with your temporary password</Preview>
      <Body style={{ backgroundColor: bg, color: text, fontFamily: "sans-serif" }}>
        <Container style={{ padding: "24px", maxWidth: "480px" }}>
          <BrandLogo />
          <Heading as="h2" style={{ color: text, fontSize: "20px" }}>
            LIVE!
          </Heading>
          <Text style={{ color: text }}>
            Hi {name}, your {isAdmin ? "admin" : "portal"} access is ready. Sign in
            with this temporary password and change it once you&apos;re in.
          </Text>
          <Section
            style={{
              backgroundColor: card,
              border: `1px solid ${border}`,
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <Text style={{ color: muted, fontSize: "12px", margin: "0 0 4px" }}>
              Email
            </Text>
            <Text style={{ color: text, margin: "0 0 12px", fontSize: "14px" }}>
              {email}
            </Text>
            <Text style={{ color: muted, fontSize: "12px", margin: "0 0 4px" }}>
              Temporary password
            </Text>
            <Text
              style={{
                color: text,
                margin: 0,
                fontSize: "18px",
                fontFamily: "monospace",
                letterSpacing: "0.04em",
              }}
            >
              {password}
            </Text>
          </Section>
          <Text style={{ color: text }}>
            Sign in at <Link href={loginUrl}>{loginUrl}</Link>
          </Text>
          <Text style={{ color: muted, fontSize: "12px" }}>
            If you didn&apos;t expect this email, contact your manager.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
