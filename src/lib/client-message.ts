import type { MessageLanguage } from "@/lib/message-languages";

/**
 * Builds a client WhatsApp message from an admin template + the sale/history.
 * Fills `{name}` (client first name) and `{last_product}` (their most recent
 * item) tokens — dropping either cleanly when there's nothing to fill — and
 * optionally appends the products just bought as a localized list.
 *
 * Two message types use it: the thank-you appends the current order's items;
 * the hello uses the `{last_product}` token from purchase history.
 *
 * Pure: no DB, no network, no clock.
 */

export type MessageItem = { title: string; quantity: number };

const ORDER_HEADER: Record<MessageLanguage, string> = {
  pt: "Seu pedido:",
  en: "Your order:",
  es: "Tu pedido:",
};

function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function buildMessage({
  body,
  name,
  language,
  appendItems,
  lastProduct,
}: {
  body: string;
  name?: string | null;
  language: MessageLanguage;
  appendItems?: MessageItem[];
  lastProduct?: string | null;
}): string {
  const fn = firstName(name);
  // With a name, substitute; without one, drop the token AND a leading ", " so
  // "Good morning, {name}!" becomes "Good morning!", not "Good morning, !".
  let text = fn
    ? body.replace(/\{name\}/g, fn)
    : body.replace(/,?[ \t]*\{name\}/g, "");

  const lp = (lastProduct ?? "").trim();
  text = lp
    ? text.replace(/\{last_product\}/g, lp)
    : text.replace(/\{last_product\}/g, "").replace(/ {2,}/g, " ");
  text = text.trim();

  if (appendItems && appendItems.length > 0) {
    const byTitle = new Map<string, number>();
    for (const i of appendItems) {
      const t = i.title.trim();
      if (!t) continue;
      byTitle.set(t, (byTitle.get(t) ?? 0) + (i.quantity || 1));
    }
    const lines = [...byTitle].map(([t, q]) => (q > 1 ? `• ${q}× ${t}` : `• ${t}`));
    if (lines.length > 0) {
      text += `\n\n${ORDER_HEADER[language]}\n${lines.join("\n")}`;
    }
  }
  return text;
}
