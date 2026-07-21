import { describe, expect, it } from "vitest";
import { countryFromPhone, tallyCountries } from "@/lib/phone-country";

describe("countryFromPhone", () => {
  it("reads the country from an E.164 number", () => {
    expect(countryFromPhone("+573001234567")?.name).toBe("Colombia");
    expect(countryFromPhone("+5491123456789")?.name).toBe("Argentina");
    expect(countryFromPhone("+442071838750")?.name).toBe("United Kingdom");
  });

  it("returns null for a number that parses but isn't a real range", () => {
    // +44 7700 900xxx is Ofcom's reserved drama range: a calling code with no
    // valid country behind it. Better unknown than confidently wrong.
    expect(countryFromPhone("+447700900123")).toBeNull();
  });

  it("splits shared calling codes by area code", () => {
    // All +1, but libphonenumber tells the NANP members apart.
    expect(countryFromPhone("+18095551234")?.iso).toBe("DO");
    expect(countryFromPhone("+13055551234")?.iso).toBe("US");
    expect(countryFromPhone("+16045551234")?.iso).toBe("CA");
  });

  it("names countries from CLDR and derives the flag from the ISO code", () => {
    const co = countryFromPhone("+573001234567");
    expect(co).toMatchObject({ iso: "CO", name: "Colombia", flag: "🇨🇴" });
  });

  it("tolerates spaces, dashes, dots and parens", () => {
    expect(countryFromPhone("+57 (300) 123-4567")?.iso).toBe("CO");
    expect(countryFromPhone("+1.305.555.1234")?.iso).toBe("US");
  });

  it("returns null rather than guessing a country", () => {
    expect(countryFromPhone(null)).toBeNull();
    expect(countryFromPhone("")).toBeNull();
    expect(countryFromPhone("3001234567")).toBeNull(); // no country indicator
    expect(countryFromPhone("+999999999")).toBeNull(); // unassigned code
  });

  it("never falls back to the home market the way splitPhone does", () => {
    // The employee-field helper defaults to +57; this must not.
    expect(countryFromPhone("someone forgot the plus")).toBeNull();
  });
});

describe("tallyCountries", () => {
  it("counts clients per country, biggest first", () => {
    const rows = tallyCountries([
      "+13055551234",
      "+13055559999",
      "+573001234567",
    ]);
    expect(rows[0]).toMatchObject({ clients: 2 });
    expect(rows[0].country?.iso).toBe("US");
    expect(rows[1].country?.iso).toBe("CO");
  });

  it("puts the unknown bucket last even when it's the biggest", () => {
    const rows = tallyCountries([null, null, null, "+573001234567"]);
    expect(rows[0].country?.iso).toBe("CO");
    expect(rows[rows.length - 1]).toMatchObject({ country: null, clients: 3 });
  });

  it("omits the unknown bucket when every number resolves", () => {
    const rows = tallyCountries(["+573001234567"]);
    expect(rows).toHaveLength(1);
    expect(rows.some((r) => r.country === null)).toBe(false);
  });

  it("returns nothing for no input", () => {
    expect(tallyCountries([])).toEqual([]);
  });
});
