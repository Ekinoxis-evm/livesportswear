"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin, accessibleLocationIds } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { type ActionResult, dbError, firstError } from "@/server/shared";
import {
  MESSAGE_LANGUAGES,
  MESSAGE_KEYS,
  type MessageLanguage,
  type MessageKey,
} from "@/lib/message-languages";

/** Bodies for one message kind, by language. */
export type TemplateBodies = Record<MessageLanguage, string>;

/** The admin's accessible location ids, resolving "all" to the concrete set. */
async function scopeLocationIds(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
): Promise<string[]> {
  const access = await accessibleLocationIds();
  if (access !== "all") return access;
  const { data } = await supabase.from("locations").select("id");
  return (data ?? []).map((l) => l.id);
}

/** Every message kind's bodies for the admin's store (first accessible location). */
export async function listMessageTemplates(): Promise<
  ActionResult<{ templates: Record<MessageKey, TemplateBodies> }>
> {
  await requireAdmin();
  const supabase = await createServerClient();
  const ids = await scopeLocationIds(supabase);
  if (ids.length === 0) return { ok: false, error: "No location to manage." };

  const { data, error } = await supabase
    .from("message_templates")
    .select("key, language, body")
    .eq("location_id", ids[0]);
  if (error) return { ok: false, error: dbError(error) };

  const empty = (): TemplateBodies => ({ pt: "", en: "", es: "" });
  const templates = {
    thank_you: empty(),
    hello: empty(),
  } as Record<MessageKey, TemplateBodies>;
  for (const r of data ?? []) {
    if (
      (MESSAGE_KEYS as readonly string[]).includes(r.key) &&
      (MESSAGE_LANGUAGES as readonly string[]).includes(r.language)
    ) {
      templates[r.key as MessageKey][r.language as MessageLanguage] = r.body;
    }
  }
  return { ok: true, data: { templates } };
}

const saveSchema = z.object({
  key: z.enum(MESSAGE_KEYS),
  language: z.enum(MESSAGE_LANGUAGES),
  body: z.string().trim().min(1).max(4000),
});

/**
 * Save one (kind, language) body. Written to every location the admin can
 * access (one store today) — the kiosk reads it to build the WhatsApp message.
 */
export async function saveMessageTemplate(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const ids = await scopeLocationIds(supabase);
  if (ids.length === 0) return { ok: false, error: "No location to manage." };

  const { error } = await supabase.from("message_templates").upsert(
    ids.map((location_id) => ({
      location_id,
      key: parsed.data.key,
      language: parsed.data.language,
      body: parsed.data.body,
    })),
    { onConflict: "location_id,key,language" },
  );
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/clients");
  return { ok: true };
}
