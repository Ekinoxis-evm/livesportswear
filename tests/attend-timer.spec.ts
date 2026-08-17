import { describe, expect, it } from "vitest";
import {
  asQueue,
  pushOpen,
  popById,
  popOldest,
  popNewest,
  oldestAt,
  servedSeconds,
} from "@/lib/attend-timer";

describe("asQueue", () => {
  it("keeps only well-formed entries, drops null/garbage", () => {
    expect(asQueue(null)).toEqual([]);
    expect(
      asQueue([{ id: "a", kind: "walkin", at: "t1" }, { kind: "x" }, { at: "t2" }, 5]),
    ).toEqual([{ id: "a", kind: "walkin", at: "t1" }]);
  });

  // Entries written before ids existed must keep working — and the derived id
  // has to be stable, because the board sends it out and the finish sends it
  // back on a later read.
  it("derives a stable id for a pre-id entry", () => {
    const raw = [{ kind: "walkin", at: "t1" }];
    expect(asQueue(raw)).toEqual([{ id: "walkin-t1", kind: "walkin", at: "t1" }]);
    expect(asQueue(raw)).toEqual(asQueue(raw));
  });
});

describe("pushOpen", () => {
  it("appends a taken client to the end", () => {
    const q = pushOpen(pushOpen([], "walkin", "t1", "a"), "return", "t2", "b");
    expect(q).toEqual([
      { id: "a", kind: "walkin", at: "t1" },
      { id: "b", kind: "return", at: "t2" },
    ]);
  });
});

const three = [
  { id: "a", kind: "walkin", at: "t1" },
  { id: "b", kind: "return", at: "t2" },
  { id: "c", kind: "walkin", at: "t3" },
] as const;

describe("popById — the rep says which client left", () => {
  it("pops that exact client, not the oldest of the kind", () => {
    const r = popById([...three], "c");
    expect(r.entry).toEqual({ id: "c", kind: "walkin", at: "t3" });
    expect(r.queue).toEqual([
      { id: "a", kind: "walkin", at: "t1" },
      { id: "b", kind: "return", at: "t2" },
    ]);
  });

  it("returns a null entry for an unknown id so the caller can fall back", () => {
    const r = popById([...three], "gone");
    expect(r.entry).toBeNull();
    expect(r.queue).toEqual(three);
  });
});

describe("popOldest — finish removes the first taken of that kind", () => {
  it("pops the oldest matching kind and keeps the rest in order", () => {
    const r = popOldest([...three], "walkin");
    expect(r.entry).toEqual({ id: "a", kind: "walkin", at: "t1" });
    expect(r.queue).toEqual([
      { id: "b", kind: "return", at: "t2" },
      { id: "c", kind: "walkin", at: "t3" },
    ]);
  });

  it("returns null entry (no duration) when the kind isn't queued", () => {
    const r = popOldest([{ id: "b", kind: "return", at: "t2" }], "walkin");
    expect(r.entry).toBeNull();
    expect(r.queue).toEqual([{ id: "b", kind: "return", at: "t2" }]);
  });
});

describe("popNewest — undo removes the last taken of that kind", () => {
  it("pops the newest matching kind, no duration", () => {
    const q = asQueue([
      { id: "a", kind: "walkin", at: "t1" },
      { id: "c", kind: "walkin", at: "t3" },
      { id: "b", kind: "return", at: "t2" },
    ]);
    expect(popNewest(q, "walkin")).toEqual([
      { id: "a", kind: "walkin", at: "t1" },
      { id: "b", kind: "return", at: "t2" },
    ]);
  });
});

describe("oldestAt", () => {
  it("returns the earliest open take-time across kinds", () => {
    expect(
      oldestAt([
        { id: "a", kind: "walkin", at: "2026-07-20T15:10:00Z" },
        { id: "b", kind: "return", at: "2026-07-20T15:02:00Z" },
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
