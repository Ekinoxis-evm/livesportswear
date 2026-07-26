import { describe, expect, it } from "vitest";
import { buildThankYou } from "@/lib/thank-you";

const items = [
  { title: "Runner shorts", quantity: 1 },
  { title: "Everyday jog pants", quantity: 1 },
];

describe("buildThankYou", () => {
  it("fills {name} with the first name", () => {
    const out = buildThankYou({
      body: "Good morning, {name}!",
      name: "Maria Lopez",
      items: [],
      language: "en",
    });
    expect(out).toBe("Good morning, Maria!");
  });

  it("drops the token and the dangling comma when there's no name", () => {
    const out = buildThankYou({
      body: "Good morning, {name}!",
      name: null,
      items: [],
      language: "en",
    });
    expect(out).toBe("Good morning!");
  });

  it("appends the products under a localized header", () => {
    const out = buildThankYou({ body: "Thanks!", name: null, items, language: "en" });
    expect(out).toBe("Thanks!\n\nYour order:\n• Runner shorts\n• Everyday jog pants");
  });

  it("localizes the order header", () => {
    expect(buildThankYou({ body: "x", name: null, items, language: "pt" })).toContain(
      "Seu pedido:",
    );
    expect(buildThankYou({ body: "x", name: null, items, language: "es" })).toContain(
      "Tu pedido:",
    );
  });

  it("merges repeated titles and shows the quantity", () => {
    const out = buildThankYou({
      body: "x",
      name: null,
      items: [
        { title: "Runner shorts", quantity: 1 },
        { title: "Runner shorts", quantity: 1 },
      ],
      language: "en",
    });
    expect(out).toContain("• 2× Runner shorts");
  });

  it("omits the order block when nothing was bought", () => {
    const out = buildThankYou({ body: "Thanks!", name: "Ana", items: [], language: "en" });
    expect(out).toBe("Thanks!");
  });
});
