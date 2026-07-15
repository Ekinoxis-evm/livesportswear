import { describe, expect, it } from "vitest";
import {
  afterClose,
  afterTake,
  canClose,
  openOfKind,
  rotationAfterFinish,
  statusAfter,
} from "@/lib/floor-state";

describe("afterTake", () => {
  it("increments only the matching counter", () => {
    expect(afterTake({ walkins: 1, returns: 2 }, "walkin")).toEqual({
      walkins: 2,
      returns: 2,
    });
    expect(afterTake({ walkins: 1, returns: 2 }, "return")).toEqual({
      walkins: 1,
      returns: 3,
    });
  });
});

describe("afterClose", () => {
  it("decrements only the matching counter", () => {
    expect(afterClose({ walkins: 2, returns: 1 }, "walkin")).toEqual({
      walkins: 1,
      returns: 1,
    });
    expect(afterClose({ walkins: 2, returns: 1 }, "return")).toEqual({
      walkins: 2,
      returns: 0,
    });
  });
  it("clamps at zero instead of going negative", () => {
    expect(afterClose({ walkins: 0, returns: 0 }, "walkin")).toEqual({
      walkins: 0,
      returns: 0,
    });
  });
});

describe("statusAfter", () => {
  it("stays attending while any open customer remains", () => {
    expect(statusAfter({ walkins: 1, returns: 0 })).toBe("attending");
    expect(statusAfter({ walkins: 0, returns: 1 })).toBe("attending");
  });
  it("returns available once every customer is closed", () => {
    expect(statusAfter({ walkins: 0, returns: 0 })).toBe("available");
  });
});

describe("canClose", () => {
  it("refuses when the kind's counter is zero", () => {
    expect(canClose({ walkins: 0, returns: 1 }, "attending", "walkin")).toBe(false);
    expect(canClose({ walkins: 1, returns: 0 }, "attending", "return")).toBe(false);
  });
  it("treats a legacy status-attending row with zero counters as one open walk-in", () => {
    expect(canClose({ walkins: 0, returns: 0 }, "attending", "walkin")).toBe(true);
    expect(canClose({ walkins: 0, returns: 0 }, "attending", "return")).toBe(false);
    expect(openOfKind({ walkins: 0, returns: 0 }, "attending", "walkin")).toBe(1);
  });
  it("sees nothing open on a plain available row", () => {
    expect(canClose({ walkins: 0, returns: 0 }, "available", "walkin")).toBe(false);
  });
});

describe("rotationAfterFinish", () => {
  it("burns a turn for a walk-in but never for a return", () => {
    expect(rotationAfterFinish(3, "walkin")).toBe(4);
    expect(rotationAfterFinish(3, "return")).toBe(3);
  });
});

describe("mixed holdings", () => {
  it("closing a return leaves open walk-ins (and the attending status) intact", () => {
    const after = afterClose({ walkins: 2, returns: 1 }, "return");
    expect(after).toEqual({ walkins: 2, returns: 0 });
    expect(statusAfter(after)).toBe("attending");
  });
});
