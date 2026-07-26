/**
 * Join a list of names into a readable, comma-separated phrase with "&" before
 * the last: [] → "", ["A"] → "A", ["A","B"] → "A & B", ["A","B","C"] →
 * "A, B & C". Intl-free (no Intl.ListFormat) so it renders identically in the
 * email runtime. Blank/whitespace entries are dropped; duplicates kept as given.
 */
export function joinNames(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(", ")} & ${clean[clean.length - 1]}`;
}
