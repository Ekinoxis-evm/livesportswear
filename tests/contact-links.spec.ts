import { describe, expect, it } from "vitest";
import { mailtoLink, whatsappLink } from "@/lib/contact-links";

describe("whatsappLink", () => {
  it("builds a wa.me link from an international number", () => {
    expect(whatsappLink("+573001234567")).toBe("https://wa.me/573001234567");
  });

  it("strips punctuation Shopify sometimes stores", () => {
    expect(whatsappLink("+1 (305) 555-1234")).toBe("https://wa.me/13055551234");
  });

  it("refuses a number with no country indicator", () => {
    // Local format would resolve to the wrong country's subscriber on wa.me.
    expect(whatsappLink("3001234567")).toBeNull();
  });

  it("refuses a missing or unplaceable number", () => {
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink("")).toBeNull();
    expect(whatsappLink("+999999999")).toBeNull();
  });
});

describe("mailtoLink", () => {
  it("builds a mailto for a real address", () => {
    expect(mailtoLink("maria@example.com")).toBe("mailto:maria@example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(mailtoLink("  john@example.com  ")).toBe("mailto:john@example.com");
  });

  it("returns null when there's nothing to send to", () => {
    expect(mailtoLink(null)).toBeNull();
    expect(mailtoLink("")).toBeNull();
    expect(mailtoLink("not-an-email")).toBeNull();
    expect(mailtoLink("missing@domain")).toBeNull();
  });
});
