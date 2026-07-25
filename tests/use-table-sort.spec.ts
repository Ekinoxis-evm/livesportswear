import { describe, expect, it } from "vitest";
import { sortRows } from "@/lib/use-table-sort";

type Row = { name: string; net: number | null };

const rows: Row[] = [
  { name: "Charlie", net: 120 },
  { name: "alice", net: 45 },
  { name: "Bob", net: null },
  { name: "dave", net: 45 },
];

describe("sortRows", () => {
  it("sorts numbers ascending", () => {
    const out = sortRows(rows, (r) => r.net, "asc");
    expect(out.map((r) => r.net)).toEqual([45, 45, 120, null]);
  });

  it("sorts numbers descending, empties still last", () => {
    const out = sortRows(rows, (r) => r.net, "desc");
    expect(out.map((r) => r.net)).toEqual([120, 45, 45, null]);
  });

  it("keeps input order on ties (stable)", () => {
    // alice and dave both 45 → alice first (its input index is lower).
    const out = sortRows(rows, (r) => r.net, "asc");
    const tie = out.filter((r) => r.net === 45).map((r) => r.name);
    expect(tie).toEqual(["alice", "dave"]);
  });

  it("sorts strings case-insensitively and numerically aware", () => {
    const out = sortRows(
      [{ name: "item10" }, { name: "item2" }, { name: "Item1" }],
      (r) => r.name,
      "asc",
    );
    expect(out.map((r) => r.name)).toEqual(["Item1", "item2", "item10"]);
  });

  it("puts empty strings last too, both directions", () => {
    const data = [{ v: "b" }, { v: "" }, { v: "a" }];
    expect(sortRows(data, (r) => r.v, "asc").map((r) => r.v)).toEqual(["a", "b", ""]);
    expect(sortRows(data, (r) => r.v, "desc").map((r) => r.v)).toEqual(["b", "a", ""]);
  });

  it("does not mutate the input array", () => {
    const input = [{ n: 3 }, { n: 1 }, { n: 2 }];
    const copy = [...input];
    sortRows(input, (r) => r.n, "asc");
    expect(input).toEqual(copy);
  });
});
