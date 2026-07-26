/** The languages a client message template comes in. Kept out of the
 *  `"use server"` action file — that file may only export async functions. */
export const MESSAGE_LANGUAGES = ["pt", "en", "es"] as const;
export type MessageLanguage = (typeof MESSAGE_LANGUAGES)[number];
