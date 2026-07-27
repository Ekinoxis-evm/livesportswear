import { describe, expect, it } from "vitest";
import { buildMessage } from "@/lib/client-message";

const items = [
  { title: "Runner shorts", quantity: 1 },
  { title: "Everyday jog pants", quantity: 1 },
];

describe("buildMessage — {name}", () => {
  it("fills {name} with the first name", () => {
    expect(
      buildMessage({ body: "Good morning, {name}!", name: "Maria Lopez", language: "en" }),
    ).toBe("Good morning, Maria!");
  });

  it("drops the token and the dangling comma when there's no name", () => {
    expect(
      buildMessage({ body: "Good morning, {name}!", name: null, language: "en" }),
    ).toBe("Good morning!");
  });
});

describe("buildMessage — {last_product}", () => {
  it("fills {last_product} with the last item bought", () => {
    expect(
      buildMessage({
        body: "Hope you love your {last_product}!",
        name: null,
        language: "en",
        lastProduct: "Runner shorts",
      }),
    ).toBe("Hope you love your Runner shorts!");
  });

  it("drops {last_product} cleanly when there's no history", () => {
    expect(
      buildMessage({ body: "Hi! {last_product}", name: null, language: "en" }),
    ).toBe("Hi!");
  });
});

describe("buildMessage — appended item list (thank-you)", () => {
  it("appends the products under a localized header", () => {
    expect(
      buildMessage({ body: "Thanks!", name: null, language: "en", appendItems: items }),
    ).toBe("Thanks!\n\nYour order:\n• Runner shorts\n• Everyday jog pants");
  });

  it("localizes the order header", () => {
    expect(
      buildMessage({ body: "x", name: null, language: "pt", appendItems: items }),
    ).toContain("Seu pedido:");
    expect(
      buildMessage({ body: "x", name: null, language: "es", appendItems: items }),
    ).toContain("Tu pedido:");
  });

  it("merges repeated titles and shows the quantity", () => {
    expect(
      buildMessage({
        body: "x",
        name: null,
        language: "en",
        appendItems: [
          { title: "Runner shorts", quantity: 1 },
          { title: "Runner shorts", quantity: 1 },
        ],
      }),
    ).toContain("• 2× Runner shorts");
  });

  it("omits the block when no items and no token", () => {
    expect(buildMessage({ body: "Thanks!", name: "Ana", language: "en" })).toBe("Thanks!");
  });
});

describe("buildMessage — signature (attributed rep)", () => {
  it("appends the rep sign-off after everything else (no token)", () => {
    expect(
      buildMessage({
        body: "Thanks!",
        name: null,
        language: "en",
        appendItems: items,
        signature: "Ana",
      }),
    ).toBe("Thanks!\n\nYour order:\n• Runner shorts\n• Everyday jog pants\n\nAna");
  });

  it("does nothing when the signature is empty or blank", () => {
    expect(buildMessage({ body: "Hi!", name: null, language: "en", signature: "  " })).toBe("Hi!");
    expect(buildMessage({ body: "Hi!", name: null, language: "en" })).toBe("Hi!");
  });
});

describe("buildMessage — {signature} token", () => {
  const tpl = "Have a great day!\n\n*{signature}*\n *LIVE!* : store.com";

  it("fills the token in place with the rep name (not appended at the end)", () => {
    expect(buildMessage({ body: tpl, name: null, language: "en", signature: "Ana Gómez" })).toBe(
      "Have a great day!\n\n*Ana Gómez*\n *LIVE!* : store.com",
    );
  });

  it("does NOT also append when the token is present", () => {
    const out = buildMessage({ body: tpl, name: null, language: "en", signature: "Ana" });
    expect(out.match(/Ana/g)).toHaveLength(1);
  });

  it("drops the token line (and its bold wrapper) cleanly when there's no signature", () => {
    expect(buildMessage({ body: tpl, name: null, language: "en" })).toBe(
      "Have a great day!\n\n *LIVE!* : store.com",
    );
  });

  it("still appends the products under the filled template", () => {
    expect(
      buildMessage({ body: tpl, name: null, language: "en", signature: "Ana", appendItems: items }),
    ).toBe(
      "Have a great day!\n\n*Ana*\n *LIVE!* : store.com\n\nYour order:\n• Runner shorts\n• Everyday jog pants",
    );
  });
});
