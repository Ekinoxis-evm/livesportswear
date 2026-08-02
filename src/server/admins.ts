"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMasterAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { tempPassword } from "@/lib/temp-password";
import { sendSafe } from "@/lib/resend";
import { CredentialsEmail } from "@/lib/emails/credentials";
import { type ActionResult, dbError } from "@/server/shared";

const uuid = z.string().uuid();

type AdminMeta = { role?: string; admin_scope?: string };
const metaOf = (m: unknown) => (m ?? {}) as AdminMeta;
const isMasterMeta = (m: AdminMeta) => !m.admin_scope || m.admin_scope === "master";

export type AdminRow = {
  userId: string;
  email: string;
  isMaster: boolean;
  locationIds: string[];
  tempPassword: string | null; // the stored handover password, until they change it
};

/** All admin accounts with their assigned locations + stored password (master only). */
export async function listAdmins(): Promise<AdminRow[]> {
  await requireMasterAdmin();
  const service = createServiceClient();
  const { data } = await service.auth.admin.listUsers();
  const admins = (data?.users ?? []).filter(
    (u) => metaOf(u.app_metadata).role === "admin",
  );
  const [{ data: maps }, { data: creds }] = await Promise.all([
    service.from("admin_locations").select("admin_user_id, location_id"),
    service.from("admin_credentials").select("admin_user_id, temp_password"),
  ]);
  const byUser = new Map<string, string[]>();
  for (const m of maps ?? []) {
    const arr = byUser.get(m.admin_user_id) ?? [];
    arr.push(m.location_id);
    byUser.set(m.admin_user_id, arr);
  }
  const pwOf = new Map((creds ?? []).map((c) => [c.admin_user_id, c.temp_password]));
  return admins.map((u) => {
    const meta = metaOf(u.app_metadata);
    return {
      userId: u.id,
      email: u.email ?? "",
      isMaster: isMasterMeta(meta),
      locationIds: byUser.get(u.id) ?? [],
      tempPassword: pwOf.get(u.id) ?? null,
    };
  });
}

const inviteSchema = z
  .object({
    email: z.string().email(),
    master: z.boolean().default(false),
    locationIds: z.array(uuid).default([]),
  })
  // A master admin covers every store; a scoped admin needs at least one.
  .refine((v) => v.master || v.locationIds.length >= 1, {
    message: "Pick at least one store, or make them a master admin.",
  });

/**
 * Invite an admin — a **master** (all stores) or a store-scoped admin with
 * assigned location(s). Creates the account with a temporary password (Supabase's
 * invite email was unreliable), STORES it in admin_credentials so it can be
 * re-copied later, emails the credentials, and returns the password once.
 */
export async function inviteAdmin(
  input: unknown,
): Promise<ActionResult<{ password: string; email: string; emailed: boolean }>> {
  const master = await requireMasterAdmin();
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Enter an email and pick at least one store (or master)." };
  }
  const { email, master: makeMaster, locationIds } = parsed.data;

  const service = createServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const password = tempPassword();
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // admin_scope is always explicit — a missing scope reads as master.
    app_metadata: { role: "admin", admin_scope: makeMaster ? "master" : "location" },
  });
  if (created.error || !created.data.user) {
    return { ok: false, error: created.error?.message ?? "Couldn't create the account." };
  }
  const userId = created.data.user.id;

  if (!makeMaster) {
    const rows = locationIds.map((location_id) => ({ admin_user_id: userId, location_id }));
    const ins = await service
      .from("admin_locations")
      .upsert(rows, { onConflict: "admin_user_id,location_id" });
    if (ins.error) return { ok: false, error: dbError(ins.error) };
  }

  await service
    .from("admin_credentials")
    .upsert(
      { admin_user_id: userId, temp_password: password, set_by: master.id },
      { onConflict: "admin_user_id" },
    );

  const sent = await sendSafe({
    to: email,
    subject: "Your Live admin access — temporary password inside",
    react: CredentialsEmail({
      name: email.split("@")[0],
      email,
      password,
      loginUrl: `${appUrl}/login`,
      isAdmin: true,
    }),
  });

  revalidatePath("/admin/settings");
  return { ok: true, data: { password, email, emailed: sent.ok } };
}

/**
 * Reset an admin's password: mint a fresh temporary one, apply it, restore the
 * stored copy, and re-email it. Master-only. Fixes a lost/forgotten password.
 */
export async function resetAdminPassword(
  adminUserId: string,
): Promise<ActionResult<{ password: string; email: string; emailed: boolean }>> {
  const master = await requireMasterAdmin();
  if (!uuid.safeParse(adminUserId).success) return { ok: false, error: "Invalid id." };

  const service = createServiceClient();
  const { data: got } = await service.auth.admin.getUserById(adminUserId);
  if (!got.user || metaOf(got.user.app_metadata).role !== "admin") {
    return { ok: false, error: "Admin not found." };
  }
  const email = got.user.email ?? "";
  const password = tempPassword();
  const upd = await service.auth.admin.updateUserById(adminUserId, { password });
  if (upd.error) return { ok: false, error: upd.error.message };

  await service
    .from("admin_credentials")
    .upsert(
      { admin_user_id: adminUserId, temp_password: password, set_by: master.id },
      { onConflict: "admin_user_id" },
    );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const sent = await sendSafe({
    to: email,
    subject: "Your Live admin password was reset",
    react: CredentialsEmail({
      name: email.split("@")[0],
      email,
      password,
      loginUrl: `${appUrl}/login`,
      isAdmin: true,
    }),
  });

  revalidatePath("/admin/settings");
  return { ok: true, data: { password, email, emailed: sent.ok } };
}

/** Delete a scoped admin account (master admins can't be removed here). */
export async function removeAdmin(adminUserId: string): Promise<ActionResult> {
  const master = await requireMasterAdmin();
  if (!uuid.safeParse(adminUserId).success) {
    return { ok: false, error: "Invalid id." };
  }
  if (adminUserId === master.id) {
    return { ok: false, error: "You can't remove yourself." };
  }

  const service = createServiceClient();
  const { data } = await service.auth.admin.getUserById(adminUserId);
  if (data.user && isMasterMeta(metaOf(data.user.app_metadata))) {
    return { ok: false, error: "Can't remove another master admin here." };
  }

  await service.auth.admin.deleteUser(adminUserId); // cascades admin_locations
  revalidatePath("/admin/settings");
  return { ok: true };
}
