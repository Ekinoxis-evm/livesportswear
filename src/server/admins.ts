"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMasterAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { sendSafe } from "@/lib/resend";
import { InviteEmail } from "@/lib/emails/invite";
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
};

/** All admin accounts with their assigned locations (master admin only). */
export async function listAdmins(): Promise<AdminRow[]> {
  await requireMasterAdmin();
  const service = createServiceClient();
  const { data } = await service.auth.admin.listUsers();
  const admins = (data?.users ?? []).filter(
    (u) => metaOf(u.app_metadata).role === "admin",
  );
  const { data: maps } = await service
    .from("admin_locations")
    .select("admin_user_id, location_id");
  const byUser = new Map<string, string[]>();
  for (const m of maps ?? []) {
    const arr = byUser.get(m.admin_user_id) ?? [];
    arr.push(m.location_id);
    byUser.set(m.admin_user_id, arr);
  }
  return admins.map((u) => {
    const meta = metaOf(u.app_metadata);
    return {
      userId: u.id,
      email: u.email ?? "",
      isMaster: isMasterMeta(meta),
      locationIds: byUser.get(u.id) ?? [],
    };
  });
}

const inviteSchema = z.object({
  email: z.string().email(),
  locationIds: z.array(uuid).min(1),
});

/** Invite a location-scoped admin and assign their store(s). */
export async function inviteAdmin(input: unknown): Promise<ActionResult> {
  await requireMasterAdmin();
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Enter an email and pick at least one store." };
  }
  const { email, locationIds } = parsed.data;

  const service = createServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${appUrl}/reset-password` },
  });
  if (linkErr || !link.user || !link.properties) {
    return { ok: false, error: linkErr?.message ?? "Couldn't create the invite." };
  }

  const userId = link.user.id;
  const upd = await service.auth.admin.updateUserById(userId, {
    app_metadata: { role: "admin", admin_scope: "location" },
  });
  if (upd.error) return { ok: false, error: upd.error.message };

  const rows = locationIds.map((location_id) => ({ admin_user_id: userId, location_id }));
  const ins = await service
    .from("admin_locations")
    .upsert(rows, { onConflict: "admin_user_id,location_id" });
  if (ins.error) return { ok: false, error: dbError(ins.error) };

  const sent = await sendSafe({
    to: email,
    subject: "You're invited as a Live store admin",
    react: InviteEmail({ employeeName: "there", actionUrl: link.properties.action_link }),
  });
  if (!sent.ok) {
    return { ok: false, error: `Admin created, but the email failed: ${sent.error}` };
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}

const setLocsSchema = z.object({
  adminUserId: uuid,
  locationIds: z.array(uuid),
});

/** Replace a scoped admin's assigned locations. */
export async function setAdminLocations(input: unknown): Promise<ActionResult> {
  const master = await requireMasterAdmin();
  const parsed = setLocsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { adminUserId, locationIds } = parsed.data;
  if (adminUserId === master.id) {
    return { ok: false, error: "You can't scope your own master account." };
  }

  const service = createServiceClient();
  await service.from("admin_locations").delete().eq("admin_user_id", adminUserId);
  if (locationIds.length) {
    const rows = locationIds.map((location_id) => ({
      admin_user_id: adminUserId,
      location_id,
    }));
    const ins = await service.from("admin_locations").insert(rows);
    if (ins.error) return { ok: false, error: dbError(ins.error) };
  }

  revalidatePath("/admin/settings");
  return { ok: true };
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
