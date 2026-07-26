import { describe, expect, it } from "vitest";
import { joinNames } from "@/lib/format-list";

describe("joinNames", () => {
  it("returns empty for no names", () => {
    expect(joinNames([])).toBe("");
  });

  it("returns the single name unchanged", () => {
    expect(joinNames(["Ana"])).toBe("Ana");
  });

  it("joins two with an ampersand", () => {
    expect(joinNames(["Ana", "Ben"])).toBe("Ana & Ben");
  });

  it("comma-separates three or more with & before the last", () => {
    expect(joinNames(["Ana", "Ben", "Carla"])).toBe("Ana, Ben & Carla");
  });

  it("drops blank/whitespace entries", () => {
    expect(joinNames(["Ana", "  ", "", "Ben"])).toBe("Ana & Ben");
  });
});
