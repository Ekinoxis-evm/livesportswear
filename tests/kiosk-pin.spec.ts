import { describe, it, expect } from "vitest";
import { hashPin, PIN_RE } from "@/lib/kiosk-pin";

describe("PIN_RE", () => {
  it("accepts exactly four digits", () => {
    expect(PIN_RE.test("0412")).toBe(true);
  });
  it.each(["123", "12345", "12a4", "", "12 4"])("rejects %j", (v) => {
    expect(PIN_RE.test(v)).toBe(false);
  });
});

describe("hashPin", () => {
  it("is deterministic per employee", () => {
    expect(hashPin("1234", "emp-a")).toBe(hashPin("1234", "emp-a"));
  });
  it("salts by employee — same PIN, different hashes", () => {
    expect(hashPin("1234", "emp-a")).not.toBe(hashPin("1234", "emp-b"));
  });
  it("differs across PINs", () => {
    expect(hashPin("1234", "emp-a")).not.toBe(hashPin("4321", "emp-a"));
  });
});
