/** Country dial codes for the phone field. Colombia first (home market). */
export const DIAL_CODES = [
  { code: "+57", country: "Colombia", flag: "🇨🇴" },
  { code: "+1", country: "United States", flag: "🇺🇸" },
  { code: "+52", country: "Mexico", flag: "🇲🇽" },
  { code: "+51", country: "Peru", flag: "🇵🇪" },
  { code: "+56", country: "Chile", flag: "🇨🇱" },
  { code: "+54", country: "Argentina", flag: "🇦🇷" },
  { code: "+55", country: "Brazil", flag: "🇧🇷" },
  { code: "+593", country: "Ecuador", flag: "🇪🇨" },
  { code: "+58", country: "Venezuela", flag: "🇻🇪" },
  { code: "+507", country: "Panama", flag: "🇵🇦" },
  { code: "+34", country: "Spain", flag: "🇪🇸" },
  { code: "+44", country: "United Kingdom", flag: "🇬🇧" },
] as const;

const DEFAULT_DIAL_CODE = "+57";

/** label map for a Base UI Select `items` prop (value -> display). */
export const DIAL_CODE_ITEMS: Record<string, string> = Object.fromEntries(
  DIAL_CODES.map((d) => [d.code, `${d.flag} ${d.code}`]),
);

/** Splits a stored phone ("+57 3001234567") into its dial code and national part. */
export function splitPhone(phone: string | null | undefined): {
  dialCode: string;
  number: string;
} {
  const value = (phone ?? "").trim();
  if (!value) return { dialCode: DEFAULT_DIAL_CODE, number: "" };

  const match = [...DIAL_CODES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((d) => value.startsWith(d.code));

  if (!match) return { dialCode: DEFAULT_DIAL_CODE, number: value };
  return { dialCode: match.code, number: value.slice(match.code.length).trim() };
}

/** Combines a dial code + national number back into a single stored value. */
export function joinPhone(dialCode: string, number: string): string {
  const n = number.trim();
  return n ? `${dialCode} ${n}` : "";
}
