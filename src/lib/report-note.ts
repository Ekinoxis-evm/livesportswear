/**
 * The closer's free-text note on one daily report.
 *
 * The note is typed at the kiosk or pasted in from wherever it was drafted, so
 * it arrives with whatever the source left on it — CRLF line endings, trailing
 * blank lines, a signature block. This is the single place that decides what a
 * note IS, so the email body, the wizard's counter and the stored close row can
 * never disagree about it.
 *
 * Pure: no DB, no network, no clock.
 */
export const NOTE_MAX = 1000;

export function cleanNote(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const text = raw
    .replace(/\r\n?/g, "\n")
    // A pasted message often carries a run of blank lines; one is a paragraph
    // break, five is an accident.
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  if (text.length === 0) return null;
  // trimEnd again: the cut can land mid-whitespace.
  return text.length > NOTE_MAX ? text.slice(0, NOTE_MAX).trimEnd() : text;
}
