import { describe, expect, it } from "vitest";
import { resolveRecipients } from "@/lib/report-recipients";

const stored = ["owner@live.com", "accountant@live.com", "manager@live.com"];

describe("resolveRecipients", () => {
  it("keeps only the survivors of the default list", () => {
    expect(resolveRecipients(stored, ["owner@live.com"])).toEqual(["owner@live.com"]);
  });

  it("allows a valid address added for this send", () => {
    // The kiosk can already add permanent recipients from the same screen, so a
    // one-off add is no new capability.
    expect(resolveRecipients(stored, ["owner@live.com", "guest@outside.com"])).toEqual([
      "owner@live.com",
      "guest@outside.com",
    ]);
  });

  it("drops a malformed address rather than passing junk to the mail API", () => {
    expect(resolveRecipients(stored, ["owner@live.com", "not-an-email"])).toEqual([
      "owner@live.com",
    ]);
  });

  it("normalises case and whitespace, and de-duplicates", () => {
    expect(resolveRecipients(stored, ["  OWNER@Live.com ", "owner@live.com"])).toEqual([
      "owner@live.com",
    ]);
  });

  it("treats no selection as the full stored list", () => {
    expect(resolveRecipients(stored, undefined)).toEqual(stored);
    expect(resolveRecipients(stored, [])).toEqual(stored);
  });

  it("falls back to everyone rather than sending to nobody", () => {
    // A selection that resolves to nothing (all removed, nothing valid added).
    expect(resolveRecipients(stored, ["   ", "bad@"])).toEqual(stored);
  });
});
