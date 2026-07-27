import type { Country } from "@/lib/phone-country";

/** Flag + country name (or a muted "unknown"), shared across the client lists. */
export function CountryCell({ country }: { country: Country | null }) {
  if (!country) return <span className="text-muted-foreground">unknown</span>;
  return (
    <span className="whitespace-nowrap">
      <span aria-hidden>{country.flag}</span> {country.name}
    </span>
  );
}
