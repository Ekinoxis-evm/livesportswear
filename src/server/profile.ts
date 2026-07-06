"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { requireEmployee } from "@/lib/auth";
import { type ActionResult } from "@/server/shared";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Employee uploads their own profile photo. Goes through the service client
 * after the employee is authenticated — employees have no write policy on the
 * employees table, so they can't change anything but their photo this way.
 */
export async function updateOwnPhoto(formData: FormData): Promise<ActionResult> {
  const { employee } = await requireEmployee();

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image." };
  }
  if (!ALLOWED.has(file.type)) {
    return { ok: false, error: "Use a JPG, PNG, or WebP image." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Image must be under 5 MB." };
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${employee.id}/avatar.${ext}`;
  const service = createServiceClient();

  const upload = await service.storage
    .from("avatars")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: true,
    });
  if (upload.error) return { ok: false, error: "Upload failed. Try again." };

  const { data } = service.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?v=${file.size}`; // bust cache when the file changes

  const updated = await service
    .from("employees")
    .update({ avatar_url: url })
    .eq("id", employee.id);
  if (updated.error) return { ok: false, error: "Couldn't save your photo." };

  revalidatePath("/portal");
  return { ok: true };
}

const passwordSchema = z.string().min(8).max(128);

/**
 * Employee changes their own password. Clears the admin-stored temporary
 * credential — from then on nobody but the employee knows it.
 */
export async function changeOwnPassword(input: unknown): Promise<ActionResult> {
  const { user, employee } = await requireEmployee();
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Use at least 8 characters." };
  }

  const service = createServiceClient();
  const upd = await service.auth.admin.updateUserById(user.id, {
    password: parsed.data,
  });
  if (upd.error) return { ok: false, error: upd.error.message };

  await service.from("employee_credentials").delete().eq("employee_id", employee.id);
  return { ok: true };
}

/**
 * After a password change that didn't go through changeOwnPassword (the
 * recovery-link page updates via the browser client), drop the stored temp
 * credential so the admin page stops showing a stale password.
 */
export async function clearMyStoredCredential(): Promise<ActionResult> {
  const { employee } = await requireEmployee();
  const service = createServiceClient();
  await service.from("employee_credentials").delete().eq("employee_id", employee.id);
  return { ok: true };
}
