import { describe, it, expect } from "vitest";
import { impliedKnewBrand, profileStepCount } from "@/lib/walkin-profile";

describe("impliedKnewBrand", () => {
  it("settles the brand question when the client bought before", () => {
    expect(impliedKnewBrand("yes")).toBe("yes");
  });

  it.each(["no", "unsure"] as const)("still asks when bought before is %s", (a) => {
    expect(impliedKnewBrand(a)).toBeNull();
  });

  // Not having bought says nothing about whether they knew us — that gap is the
  // entire reason the second question exists.
  it("never infers 'no' from not having bought", () => {
    expect(impliedKnewBrand("no")).not.toBe("no");
  });
});

describe("profileStepCount", () => {
  it("is 3 before anything is answered", () => {
    expect(profileStepCount(null)).toBe(3);
  });

  it("drops to 2 once the client has bought before", () => {
    expect(profileStepCount("yes")).toBe(2);
  });

  it.each(["no", "unsure"] as const)("stays 3 when bought before is %s", (a) => {
    expect(profileStepCount(a)).toBe(3);
  });
});
