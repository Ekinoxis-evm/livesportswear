import type { MessageLanguage } from "@/lib/message-languages";

/**
 * Builds the thank-you WhatsApp text from an admin template + the sale. Replaces
 * the `{name}` token with the client's first name (or drops it cleanly when
 * there's no name), then appends the products just bought as a localized list.
 *
 * Pure: no DB, no network, no clock.
 */

export type ThankYouItem = { title: string; quantity: number };

const ORDER_HEADER: Record<MessageLanguage, string> = {
  pt: "Seu pedido:",
  en: "Your order:",
  es: "Tu pedido:",
};

function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function buildThankYou({
  body,
  name,
  items,
  language,
}: {
  body: string;
  name: string | null | undefined;
  items: ThankYouItem[];
  language: MessageLanguage;
}): string {
  const fn = firstName(name);
  // With a name, substitute the token; without one, drop the token AND a leading
  // ", " so "Good morning, {name}!" becomes "Good morning!", not "Good morning, !".
  let text = fn
    ? body.replace(/\{name\}/g, fn)
    : body.replace(/,?[ \t]*\{name\}/g, "");
  text = text.trim();

  // Merge repeated products by title so a client who bought two variants of the
  // same piece sees one line with the combined quantity.
  const byTitle = new Map<string, number>();
  for (const i of items) {
    const t = i.title.trim();
    if (!t) continue;
    byTitle.set(t, (byTitle.get(t) ?? 0) + (i.quantity || 1));
  }
  const lines = [...byTitle].map(([t, q]) => (q > 1 ? `• ${q}× ${t}` : `• ${t}`));
  if (lines.length > 0) {
    text += `\n\n${ORDER_HEADER[language]}\n${lines.join("\n")}`;
  }
  return text;
}
