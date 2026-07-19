import { describe, expect, it } from "vitest";
import { isScannerBurst } from "@/lib/scanner-signal";

const times = (start: number, gap: number, n: number) =>
  Array.from({ length: n }, (_, i) => start + i * gap);

describe("isScannerBurst", () => {
  it("detects a machine-speed burst", () => {
    expect(isScannerBurst(times(0, 15, 13))).toBe(true);
  });

  it("rejects human-speed typing", () => {
    expect(isScannerBurst(times(0, 150, 13))).toBe(false);
  });

  it("rejects short inputs even when fast", () => {
    expect(isScannerBurst(times(0, 10, 3))).toBe(false);
  });

  it("survives one main-thread hiccup mid-burst", () => {
    const burst = times(0, 15, 12);
    burst.push(burst[burst.length - 1] + 400); // one 400ms outlier gap
    expect(isScannerBurst(burst)).toBe(true);
  });
});
