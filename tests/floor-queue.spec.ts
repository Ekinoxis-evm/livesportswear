import { describe, it, expect } from "vitest";
import { orderFloor, upNext, type FloorMember } from "@/lib/floor-queue";

const m = (
  employeeId: string,
  availableSince: string,
  status: "available" | "attending" = "available",
  leftAt: string | null = null,
  bumpedAt: string | null = null,
): FloorMember => ({
  employeeId,
  name: employeeId,
  arrivedAt: availableSince,
  availableSince,
  leftAt,
  status,
  rotationCount: 0,
  bumpedAt,
});

describe("orderFloor", () => {
  it("orders the available line FIFO by availableSince and marks the first 'up'", () => {
    const rows = orderFloor([
      m("b", "2026-06-30T15:00:00Z"),
      m("a", "2026-06-30T14:00:00Z"),
      m("c", "2026-06-30T14:30:00Z"),
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["a", "c", "b"]);
    expect(rows[0].state).toBe("up");
    expect(rows[1].state).toBe("waiting");
  });

  it("puts the first to finish first in line — a re-stamped member falls behind", () => {
    // "a" arrived first but just finished a walk-in (availableSince re-stamped);
    // "b" finished earlier, so "b" is up even with a later arrival.
    const rows = orderFloor([
      { ...m("a", "2026-06-30T17:00:00Z"), arrivedAt: "2026-06-30T09:00:00Z" },
      { ...m("b", "2026-06-30T16:00:00Z"), arrivedAt: "2026-06-30T12:00:00Z" },
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b", "a"]);
  });

  it("never orders by rotation count — turns today are display-only", () => {
    const rows = orderFloor([
      { ...m("busy", "2026-06-30T14:00:00Z"), rotationCount: 9 },
      { ...m("idle", "2026-06-30T15:00:00Z"), rotationCount: 0 },
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["busy", "idle"]);
  });

  it("breaks availableSince ties by arrival time", () => {
    const rows = orderFloor([
      { ...m("late", "2026-06-30T15:00:00Z"), arrivedAt: "2026-06-30T10:00:00Z" },
      { ...m("early", "2026-06-30T15:00:00Z"), arrivedAt: "2026-06-30T09:00:00Z" },
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["early", "late"]);
  });

  it("puts attending members after the line and out of the running for 'up'", () => {
    const rows = orderFloor([
      m("a", "2026-06-30T14:00:00Z", "attending"),
      m("b", "2026-06-30T14:30:00Z"),
    ]);
    expect(rows.find((r) => r.employeeId === "b")?.state).toBe("up");
    expect(rows.find((r) => r.employeeId === "a")?.state).toBe("attending");
  });

  it("puts a bumped member up next regardless of their FIFO spot", () => {
    const rows = orderFloor([
      m("a", "2026-06-30T14:00:00Z"),
      m("b", "2026-06-30T15:00:00Z", "available", null, "2026-06-30T16:00:00Z"),
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b", "a"]);
    expect(rows[0].state).toBe("up");
  });

  it("lets the latest bump win between two bumped members", () => {
    const rows = orderFloor([
      m("a", "2026-06-30T14:00:00Z", "available", null, "2026-06-30T16:00:00Z"),
      m("b", "2026-06-30T15:00:00Z", "available", null, "2026-06-30T17:00:00Z"),
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b", "a"]);
  });

  it("excludes employees who have left the floor", () => {
    const rows = orderFloor([
      m("a", "2026-06-30T14:00:00Z", "available", "2026-06-30T17:30:00Z"),
      m("b", "2026-06-30T14:30:00Z"),
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b"]);
  });
});

describe("orderFloor — manual order (drag-reorder)", () => {
  it("lets manual positions beat the FIFO order", () => {
    const rows = orderFloor([
      { ...m("a", "2026-06-30T14:00:00Z"), manualPos: 2 },
      { ...m("b", "2026-06-30T15:00:00Z"), manualPos: 1 },
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b", "a"]);
  });

  it("lets a bump beat a manual position", () => {
    const rows = orderFloor([
      { ...m("a", "2026-06-30T14:00:00Z"), manualPos: 1 },
      {
        ...m("b", "2026-06-30T15:00:00Z", "available", null, "2026-06-30T16:00:00Z"),
        manualPos: 2,
      },
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b", "a"]);
  });

  it("puts a member whose manual position was cleared behind the dragged ones", () => {
    // "a" finished a customer (manual_pos cleared, freshest availableSince too)
    const rows = orderFloor([
      { ...m("a", "2026-06-30T14:00:00Z"), manualPos: null },
      { ...m("b", "2026-06-30T15:00:00Z"), manualPos: 1 },
      { ...m("c", "2026-06-30T15:30:00Z"), manualPos: 2 },
    ]);
    expect(rows.map((r) => r.employeeId)).toEqual(["b", "c", "a"]);
  });
});

describe("orderFloor — multi-client counters", () => {
  it("treats a member with open clients as attending even when status lags", () => {
    const rows = orderFloor([
      { ...m("a", "2026-06-30T14:00:00Z"), attendingCount: 2 },
      m("b", "2026-06-30T15:00:00Z"),
    ]);
    expect(rows.find((r) => r.employeeId === "a")?.state).toBe("attending");
    expect(rows.find((r) => r.employeeId === "b")?.state).toBe("up");
  });

  it("keeps a return-only member IN the line (non-blocking), flagged onReturn", () => {
    const rows = orderFloor([
      { ...m("a", "2026-06-30T14:00:00Z"), returnCount: 1 },
      m("b", "2026-06-30T15:00:00Z"),
    ]);
    const a = rows.find((r) => r.employeeId === "a");
    expect(a?.state).toBe("up"); // still in the line, still up-eligible
    expect(a?.onReturn).toBe(true);
    expect(rows.find((r) => r.employeeId === "b")?.onReturn).toBe(false);
  });

  it("a walk-in AND a return together is attending, still onReturn", () => {
    const rows = orderFloor([
      { ...m("a", "2026-06-30T14:00:00Z"), attendingCount: 1, returnCount: 1 },
      m("b", "2026-06-30T15:00:00Z"),
    ]);
    const a = rows.find((r) => r.employeeId === "a");
    expect(a?.state).toBe("attending"); // the walk-in blocks the line
    expect(a?.onReturn).toBe(true);
  });

  it("keeps plain status-based attending working (pre-migration rows)", () => {
    const rows = orderFloor([m("a", "2026-06-30T14:00:00Z", "attending")]);
    expect(rows[0]?.state).toBe("attending");
  });
});

describe("orderFloor — breaks", () => {
  it("keeps an on-break member out of the line and never 'up'", () => {
    const rows = orderFloor([
      { ...m("a", "2026-07-10T14:00:00Z"), onBreak: true },
      m("b", "2026-07-10T15:00:00Z"),
    ]);
    expect(rows.find((r) => r.employeeId === "b")?.state).toBe("up");
    expect(rows.find((r) => r.employeeId === "a")?.state).toBe("break");
  });

  it("restores the exact former position when the break ends", () => {
    // availableSince is untouched by a break, so the order is identical.
    const before = orderFloor([
      m("a", "2026-07-10T14:00:00Z"),
      m("b", "2026-07-10T14:30:00Z"),
      m("c", "2026-07-10T15:00:00Z"),
    ]).map((r) => r.employeeId);
    const after = orderFloor([
      m("a", "2026-07-10T14:00:00Z"), // came back from break
      m("b", "2026-07-10T14:30:00Z"),
      m("c", "2026-07-10T15:00:00Z"),
    ]).map((r) => r.employeeId);
    expect(after).toEqual(before);
  });

  it("treats an attending member with an inconsistent break flag as attending", () => {
    const rows = orderFloor([
      { ...m("a", "2026-07-10T14:00:00Z", "attending"), onBreak: true },
    ]);
    expect(rows[0]?.state).toBe("attending");
  });

  it("excludes an on-break member who has left the floor", () => {
    const rows = orderFloor([
      {
        ...m("a", "2026-07-10T14:00:00Z", "available", "2026-07-10T18:00:00Z"),
        onBreak: true,
      },
    ]);
    expect(rows).toEqual([]);
  });

  it("upNext skips on-break members", () => {
    expect(
      upNext([
        { ...m("a", "2026-07-10T14:00:00Z"), onBreak: true },
        m("b", "2026-07-10T15:00:00Z"),
      ])?.employeeId,
    ).toBe("b");
  });
});

describe("upNext", () => {
  it("is the earliest-available member", () => {
    expect(
      upNext([
        m("a", "2026-06-30T14:30:00Z"),
        m("b", "2026-06-30T14:00:00Z"),
      ])?.employeeId,
    ).toBe("b");
  });

  it("is null when nobody is available", () => {
    expect(upNext([m("a", "2026-06-30T14:00:00Z", "attending")])).toBeNull();
  });
});
