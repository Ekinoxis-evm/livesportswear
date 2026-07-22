import { describe, expect, it } from "vitest";
import { countryFromPhone, tallyCountries, countryTally } from "@/lib/phone-country";

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

describe("countryTally", () => {
  const rows = (...isos: (string | null)[]) => isos.map((country_iso) => ({ country_iso }));

  it("counts stored iso codes, biggest first", () => {
    const out = countryTally(rows("US", "US", "CO"));
    expect(out[0]).toMatchObject({ clients: 2 });
    expect(out[0].country?.iso).toBe("US");
    expect(out[1].country?.iso).toBe("CO");
  });

  it("rebuilds name and flag from the stored code", () => {
    expect(countryTally(rows("CO"))[0].country).toMatchObject({
      iso: "CO",
      name: "Colombia",
      flag: "🇨🇴",
    });
  });

  it("puts unknown last and counts nulls into it", () => {
    const out = countryTally(rows(null, null, "CO"));
    expect(out[out.length - 1]).toMatchObject({ country: null, clients: 2 });
  });

  it("treats a malformed code as unknown rather than inventing a country", () => {
    const out = countryTally(rows("XX1", "", "zz"));
    // "zz" is a well-formed pair, so it survives; the other two do not.
    expect(out.find((r) => r.country === null)?.clients).toBe(2);
  });

  it("always sums to the number of rows — the bug this replaced did not", () => {
    const input = rows("US", "CO", null, "AR", "US", null, "BR");
    const total = countryTally(input).reduce((a, r) => a + r.clients, 0);
    expect(total).toBe(input.length);
  });
});

describe("countryTally — pre-grouped rows", () => {
  it("uses each row's own count instead of counting objects", () => {
    // What a database GROUP BY hands back: one row per country, with its count.
    const out = countryTally([
      { country_iso: "US", clients: 3200 },
      { country_iso: "CO", clients: 400 },
      { country_iso: null, clients: 1660 },
    ]);
    expect(out[0]).toMatchObject({ clients: 3200 });
    expect(out[out.length - 1]).toMatchObject({ country: null, clients: 1660 });
    expect(out.reduce((a, r) => a + r.clients, 0)).toBe(5260);
  });

  it("merges duplicate rows for the same country", () => {
    // The cross-tab emits one row per (rep, country), so a country appears once
    // per rep and the counts must add up rather than overwrite.
    const out = countryTally([
      { country_iso: "US", clients: 10 },
      { country_iso: "US", clients: 5 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].clients).toBe(15);
  });
});
