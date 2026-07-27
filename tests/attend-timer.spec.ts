import { describe, expect, it } from "vitest";
import {
  asQueue,
  pushOpen,
  popOldest,
  popNewest,
  oldestAt,
  servedSeconds,
} from "@/lib/attend-timer";

describe("asQueue", () => {
  it("keeps only well-formed entries, drops null/garbage", () => {
    expect(asQueue(null)).toEqual([]);
    expect(asQueue([{ kind: "walkin", at: "t1" }, { kind: "x" }, { at: "t2" }, 5])).toEqual([
      { kind: "walkin", at: "t1" },
    ]);
  });
});

describe("pushOpen", () => {
  it("appends a taken client to the end", () => {
    const q = pushOpen(pushOpen([], "walkin", "t1"), "return", "t2");
    expect(q).toEqual([
      { kind: "walkin", at: "t1" },
      { kind: "return", at: "t2" },
    ]);
  });
});

describe("popOldest — finish removes the first taken of that kind", () => {
  const q = [
    { kind: "walkin", at: "t1" },
    { kind: "return", at: "t2" },
    { kind: "walkin", at: "t3" },
  ] as const;

  it("pops the oldest matching kind and keeps the rest in order", () => {
    const r = popOldest([...q], "walkin");
    expect(r.entry).toEqual({ kind: "walkin", at: "t1" });
    expect(r.queue).toEqual([
      { kind: "return", at: "t2" },
      { kind: "walkin", at: "t3" },
    ]);
  });

  it("returns null entry (no duration) when the kind isn't queued", () => {
    const r = popOldest([{ kind: "return", at: "t2" }], "walkin");
    expect(r.entry).toBeNull();
    expect(r.queue).toEqual([{ kind: "return", at: "t2" }]);
  });
});

describe("popNewest — undo removes the last taken of that kind", () => {
  it("pops the newest matching kind, no duration", () => {
    const q = asQueue([
      { kind: "walkin", at: "t1" },
      { kind: "walkin", at: "t3" },
      { kind: "return", at: "t2" },
    ]);
    expect(popNewest(q, "walkin")).toEqual([
      { kind: "walkin", at: "t1" },
      { kind: "return", at: "t2" },
    ]);
  });
});

describe("oldestAt", () => {
  it("returns the earliest open take-time across kinds", () => {
    expect(
      oldestAt([
        { kind: "walkin", at: "2026-07-20T15:10:00Z" },
        { kind: "return", at: "2026-07-20T15:02:00Z" },
      ]),
    ).toBe("2026-07-20T15:02:00Z");
    expect(oldestAt([])).toBeNull();
  });
});

describe("servedSeconds", () => {
  it("is the whole-second difference, clamped at zero", () => {
    expect(servedSeconds("2026-07-20T15:00:00Z", "2026-07-20T15:04:12Z")).toBe(252);
    expect(servedSeconds("2026-07-20T15:04:00Z", "2026-07-20T15:00:00Z")).toBe(0);
  });
});
