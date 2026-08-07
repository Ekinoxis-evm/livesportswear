import { describe, expect, it } from "vitest";
import { cleanNote, NOTE_MAX } from "@/lib/report-note";

describe("cleanNote", () => {
  it("returns null when there is no note", () => {
    expect(cleanNote(undefined)).toBeNull();
    expect(cleanNote(null)).toBeNull();
    expect(cleanNote("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(cleanNote("   \n\n \t ")).toBeNull();
  });

  it("keeps a plain note unchanged", () => {
    expect(cleanNote("POS was down 3–4pm.")).toBe("POS was down 3–4pm.");
  });

  it("normalizes pasted CRLF line endings", () => {
    expect(cleanNote("first\r\nsecond")).toBe("first\nsecond");
  });

  it("keeps a single blank line as a paragraph break", () => {
    expect(cleanNote("first\n\nsecond")).toBe("first\n\nsecond");
  });

  it("collapses a run of blank lines from a paste", () => {
    expect(cleanNote("first\n\n\n\n\nsecond")).toBe("first\n\nsecond");
  });

  it("strips trailing spaces on each line", () => {
    expect(cleanNote("first   \nsecond  ")).toBe("first\nsecond");
  });

  it("caps an over-long note at the limit", () => {
    const note = cleanNote("a".repeat(NOTE_MAX + 250));
    expect(note).toHaveLength(NOTE_MAX);
  });

  it("leaves no trailing whitespace when the cap lands on a space", () => {
    const note = cleanNote(`${"a".repeat(NOTE_MAX - 1)} tail`);
    expect(note).toBe("a".repeat(NOTE_MAX - 1));
  });
});
