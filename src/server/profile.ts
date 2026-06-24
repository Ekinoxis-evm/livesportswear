"use server";

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
