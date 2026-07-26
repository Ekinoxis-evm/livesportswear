/** The languages + kinds a client message template comes in. Kept out of the
 *  `"use server"` action file — that file may only export async functions. */
export const MESSAGE_LANGUAGES = ["pt", "en", "es"] as const;
export type MessageLanguage = (typeof MESSAGE_LANGUAGES)[number];

/** Message kinds. `thank_you` appends the current order; `hello` uses the
 *  `{last_product}` token from purchase history. */
export const MESSAGE_KEYS = ["thank_you", "hello"] as const;
export type MessageKey = (typeof MESSAGE_KEYS)[number];
