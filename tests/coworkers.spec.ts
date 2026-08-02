import { describe, expect, it } from "vitest";
import { overlappingCoworkerNames, type CoShift } from "@/lib/coworkers";

const names = new Map([
  ["a", "Ana"],
  ["b", "Bruno"],
  ["c", "Camila"],
]);
const shift = (
  employee_id: string,
  start_time: string,
  end_time: string,
  date = "2026-08-03",
): CoShift => ({ employee_id, date, start_time, end_time });

describe("overlappingCoworkerNames", () => {
  it("lists coworkers whose same-day hours overlap the target", () => {
    const target = shift("a", "09:30", "17:30");
    const all = [target, shift("b", "09:30", "17:30"), shift("c", "14:30", "22:30")];
    // b shares the morning; c (evening) overlaps 14:30–17:30 → both count.
    expect(overlappingCoworkerNames(target, all, names)).toEqual(["Bruno", "Camila"]);
  });

  it("excludes adjacent shifts that only touch at the boundary", () => {
    const target = shift("a", "09:30", "14:30");
    const all = [target, shift("b", "14:30", "22:30")];
    expect(overlappingCoworkerNames(target, all, names)).toEqual([]);
  });

  it("ignores shifts on a different day", () => {
    const target = shift("a", "09:30", "17:30", "2026-08-03");
    const all = [target, shift("b", "09:30", "17:30", "2026-08-04")];
    expect(overlappingCoworkerNames(target, all, names)).toEqual([]);
  });

  it("never lists the target employee themselves", () => {
    const target = shift("a", "09:30", "17:30");
    const all = [target, shift("a", "09:30", "17:30")];
    expect(overlappingCoworkerNames(target, all, names)).toEqual([]);
  });

  it("dedupes an employee with two overlapping shifts and sorts by name", () => {
    const target = shift("a", "09:30", "22:30");
    const all = [
      target,
      shift("c", "14:30", "22:30"),
      shift("b", "09:30", "13:30"),
      shift("b", "13:30", "17:30"),
    ];
    expect(overlappingCoworkerNames(target, all, names)).toEqual(["Bruno", "Camila"]);
  });

  it("renders an em dash for an unknown employee id", () => {
    const target = shift("a", "09:30", "17:30");
    const all = [target, shift("z", "09:30", "17:30")];
    expect(overlappingCoworkerNames(target, all, names)).toEqual(["—"]);
  });
});
