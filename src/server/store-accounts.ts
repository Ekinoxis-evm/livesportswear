"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin, accessibleLocationIds } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { tempPassword } from "@/lib/temp-password";
import type { ActionResult } from "@/server/shared";

const schema = z.object({
  location_id: z.string().uuid(),
  email: z.string().email(),
});

/**
 * Create the shared store-screen account for a location: role=store with the
 * location_id claim — no employees row, no personal identity. The generated
 * password is returned once to the admin (not stored).
 */
export async function createStoreAccount(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ password: string }>> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  // A location-scoped admin may only manage kiosk logins for THEIR stores.
  const access = await accessibleLocationIds();
  if (access !== "all" && !access.includes(parsed.data.location_id)) {
    return { ok: false, error: "You don't manage that store." };
  }

  const service = createServiceClient();
  const { data: loc } = await service
    .from("locations")
    .select("id, name")
    .eq("id", parsed.data.location_id)
    .maybeSingle();
  if (!loc) return { ok: false, error: "Unknown location." };

  const password = tempPassword();
  const created = await service.auth.admin.createUser({
    email: parsed.data.email,
    password,
    email_confirm: true,
    app_metadata: { role: "store", location_id: loc.id },
  });
  if (created.error) return { ok: false, error: created.error.message };

  revalidatePath("/admin/locations");
  return { ok: true, data: { password } };
}

const resetSchema = z.object({ email: z.string().email() });

/** Reset the store account's password; the new one is returned once. */
export async function resetStorePassword(
  input: z.input<typeof resetSchema>,
): Promise<ActionResult<{ password: string }>> {
  await requireAdmin();
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const service = createServiceClient();
  const { data } = await service.auth.admin.listUsers();
  const user = (data?.users ?? []).find(
    (u) =>
      u.email?.toLowerCase() === parsed.data.email.toLowerCase() &&
      (u.app_metadata as { role?: string } | undefined)?.role === "store",
  );
  if (!user) return { ok: false, error: "No store account with that email." };
  // Scope check against the target account's location claim.
  const targetLoc = (user.app_metadata as { location_id?: string } | undefined)
    ?.location_id;
  const access = await accessibleLocationIds();
  if (access !== "all" && (!targetLoc || !access.includes(targetLoc))) {
    return { ok: false, error: "You don't manage that store." };
  }

  const password = tempPassword();
  const upd = await service.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });
  if (upd.error) return { ok: false, error: upd.error.message };

  return { ok: true, data: { password } };
}
