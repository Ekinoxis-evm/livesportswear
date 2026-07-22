import { describe, expect, it } from "vitest";
import { narrowRecipients } from "@/lib/report-recipients";

const stored = ["owner@live.com", "accountant@live.com", "manager@live.com"];

describe("narrowRecipients", () => {
  it("keeps only the addresses picked for this send", () => {
    expect(narrowRecipients(stored, ["owner@live.com"])).toEqual(["owner@live.com"]);
  });

  it("DISCARDS an address that isn't on the stored list", () => {
    // The security boundary: a kiosk must not be able to send the day's numbers
    // to an address it invents.
    expect(narrowRecipients(stored, ["attacker@evil.com"])).toEqual(stored);
  });

  it("drops the invented one but honours the legitimate picks", () => {
    expect(
      narrowRecipients(stored, ["owner@live.com", "attacker@evil.com"]),
    ).toEqual(["owner@live.com"]);
  });

  it("matches case-insensitively and ignores stray whitespace", () => {
    expect(narrowRecipients(stored, ["  OWNER@Live.com "])).toEqual(["owner@live.com"]);
  });

  it("treats no selection as send-to-everyone", () => {
    expect(narrowRecipients(stored, undefined)).toEqual(stored);
    expect(narrowRecipients(stored, [])).toEqual(stored);
  });

  it("falls back to everyone rather than silently sending to nobody", () => {
    // A stale screen could submit a list that no longer matches anything; a
    // report that reaches no one is worse than one that reaches the full list.
    expect(narrowRecipients(stored, ["gone@live.com"])).toEqual(stored);
  });
});
