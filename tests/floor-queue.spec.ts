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

describe("orderFloor — manual order (drag-reorder)", () => {
  it("lets manual positions beat rotation counts", () => {
    const rows = orderFloor([
      { ...m("a", "2026-06-30T14:00:00Z", "available", 0), manualPos: 2 },
      { ...m("b", "2026-06-30T15:00:00Z", "available", 5), manualPos: 1 },
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b", "a"]);
  });

  it("lets a bump beat a manual position", () => {
    const rows = orderFloor([
      { ...m("a", "2026-06-30T14:00:00Z", "available", 0), manualPos: 1 },
      {
        ...m("b", "2026-06-30T15:00:00Z", "available", 0, null, "2026-06-30T16:00:00Z"),
        manualPos: 2,
      },
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b", "a"]);
  });

  it("puts a member whose manual position was cleared behind the dragged ones", () => {
    // "a" finished a customer (manual_pos cleared, rotation lower than anyone)
    const rows = orderFloor([
      { ...m("a", "2026-06-30T14:00:00Z", "available", 0), manualPos: null },
      { ...m("b", "2026-06-30T15:00:00Z", "available", 3), manualPos: 1 },
      { ...m("c", "2026-06-30T15:30:00Z", "available", 4), manualPos: 2 },
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b", "c", "a"]);
  });
});

describe("orderFloor — multi-client counters", () => {
  it("treats a member with open clients as attending even when status lags", () => {
    const rows = orderFloor([
      { ...m("a", "2026-06-30T14:00:00Z", "available", 0), attendingCount: 2 },
      m("b", "2026-06-30T15:00:00Z", "available", 0),
    ]);
    expect(rows.find((r) => r.employeeId === "a")?.state).toBe("attending");
    expect(rows.find((r) => r.employeeId === "b")?.state).toBe("up");
  });

  it("counts an open return as attending", () => {
    const rows = orderFloor([
      { ...m("a", "2026-06-30T14:00:00Z", "available", 0), returnCount: 1 },
    ]);
    expect(rows[0]?.state).toBe("attending");
  });

  it("keeps plain status-based attending working (pre-migration rows)", () => {
    const rows = orderFloor([m("a", "2026-06-30T14:00:00Z", "attending", 0)]);
    expect(rows[0]?.state).toBe("attending");
  });
});

describe("orderFloor — breaks", () => {
  it("keeps an on-break member out of the line and never 'up'", () => {
    const rows = orderFloor([
      { ...m("a", "2026-07-10T14:00:00Z", "available", 0), onBreak: true },
      m("b", "2026-07-10T15:00:00Z", "available", 3),
    ]);
    expect(rows.find((r) => r.employeeId === "b")?.state).toBe("up");
    expect(rows.find((r) => r.employeeId === "a")?.state).toBe("break");
  });

  it("restores the exact former position when the break ends", () => {
    const before = orderFloor([
      m("a", "2026-07-10T14:00:00Z", "available", 0),
      m("b", "2026-07-10T14:30:00Z", "available", 0),
      m("c", "2026-07-10T15:00:00Z", "available", 1),
    ]).map((r) => r.employeeId);
    const after = orderFloor([
      m("a", "2026-07-10T14:00:00Z", "available", 0), // came back from break
      m("b", "2026-07-10T14:30:00Z", "available", 0),
      m("c", "2026-07-10T15:00:00Z", "available", 1),
    ]).map((r) => r.employeeId);
    expect(after).toEqual(before);
  });

  it("treats an attending member with an inconsistent break flag as attending", () => {
    const rows = orderFloor([
      { ...m("a", "2026-07-10T14:00:00Z", "attending", 0), onBreak: true },
    ]);
    expect(rows[0]?.state).toBe("attending");
  });

  it("excludes an on-break member who has left the floor", () => {
    const rows = orderFloor([
      {
        ...m("a", "2026-07-10T14:00:00Z", "available", 0, "2026-07-10T18:00:00Z"),
        onBreak: true,
      },
    ]);
    expect(rows).toEqual([]);
  });

  it("upNext skips on-break members", () => {
    expect(
      upNext([
        { ...m("a", "2026-07-10T14:00:00Z", "available", 0), onBreak: true },
        m("b", "2026-07-10T15:00:00Z", "available", 5),
      ])?.employeeId,
    ).toBe("b");
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
