import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("joins cells with commas and rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["c", 1]])).toBe("a,b\r\nc,1");
  });

  it("renders null and undefined as empty cells", () => {
    expect(toCsv([[null, undefined, "x"]])).toBe(",,x");
  });

  it("quotes cells containing commas", () => {
    expect(toCsv([["a,b", "c"]])).toBe('"a,b",c');
  });

  it("escapes embedded quotes by doubling them", () => {
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""');
  });

  it("quotes cells containing newlines", () => {
    expect(toCsv([["line1\nline2"]])).toBe('"line1\nline2"');
  });
});
