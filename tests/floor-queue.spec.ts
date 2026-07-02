import { describe, it, expect } from "vitest";
import { orderFloor, upNext, type FloorMember } from "@/lib/floor-queue";

const m = (
  employeeId: string,
  arrivedAt: string,
  status: "available" | "attending" = "available",
  rotationCount = 0,
  leftAt: string | null = null,
  bumpedAt: string | null = null,
): FloorMember => ({
  employeeId,
  name: employeeId,
  arrivedAt,
  leftAt,
  status,
  rotationCount,
  bumpedAt,
});

describe("orderFloor", () => {
  it("orders the available line by rotation count, then arrival, and marks the first 'up'", () => {
    const rows = orderFloor([
      m("b", "2026-06-30T15:00:00Z", "available", 1),
      m("a", "2026-06-30T14:00:00Z", "available", 0),
      m("c", "2026-06-30T14:30:00Z", "available", 0),
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["a", "c", "b"]);
    expect(rows[0].state).toBe("up");
    expect(rows[1].state).toBe("waiting");
  });

  it("puts attending members after the line and out of the running for 'up'", () => {
    const rows = orderFloor([
      m("a", "2026-06-30T14:00:00Z", "attending", 0),
      m("b", "2026-06-30T14:30:00Z", "available", 0),
    ]);
    expect(rows.find((r) => r.employeeId === "b")?.state).toBe("up");
    expect(rows.find((r) => r.employeeId === "a")?.state).toBe("attending");
  });

  it("puts a bumped member up next regardless of rotation count", () => {
    const rows = orderFloor([
      m("a", "2026-06-30T14:00:00Z", "available", 0),
      m("b", "2026-06-30T15:00:00Z", "available", 3, null, "2026-06-30T16:00:00Z"),
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b", "a"]);
    expect(rows[0].state).toBe("up");
  });

  it("lets the latest bump win between two bumped members", () => {
    const rows = orderFloor([
      m("a", "2026-06-30T14:00:00Z", "available", 0, null, "2026-06-30T16:00:00Z"),
      m("b", "2026-06-30T15:00:00Z", "available", 0, null, "2026-06-30T17:00:00Z"),
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b", "a"]);
  });

  it("excludes employees who have left the floor", () => {
    const rows = orderFloor([
      m("a", "2026-06-30T14:00:00Z", "available", 0, "2026-06-30T17:30:00Z"),
      m("b", "2026-06-30T14:30:00Z", "available", 0),
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b"]);
  });
});

describe("upNext", () => {
  it("is the lowest-rotation available member", () => {
    expect(
      upNext([
        m("a", "2026-06-30T14:00:00Z", "available", 2),
        m("b", "2026-06-30T14:30:00Z", "available", 1),
      ])?.employeeId,
    ).toBe("b");
  });

  it("is null when nobody is available", () => {
    expect(upNext([m("a", "2026-06-30T14:00:00Z", "attending", 0)])).toBeNull();
  });
});
