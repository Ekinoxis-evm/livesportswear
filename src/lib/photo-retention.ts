import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

const RETENTION_DAYS = 30;
const BATCH = 100;

export type RetentionResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

/**
 * Deletes check-in face photos older than 30 days and nulls their paths.
 * DB-driven (business_date is a plain date column) so no bucket listing or
 * timezone math is needed.
 */
export async function runPhotoRetention(): Promise<RetentionResult> {
  const service = createServiceClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  let deleted = 0;
  for (;;) {
    const { data: rows, error } = await service
      .from("floor_checkins")
      .select("id, entry_photo_path, exit_photo_path")
      .lt("business_date", cutoff)
      .or("entry_photo_path.not.is.null,exit_photo_path.not.is.null")
      .limit(BATCH);
    if (error) return { ok: false, error: error.message };
    if (!rows || rows.length === 0) break;

    const paths = rows
      .flatMap((r) => [r.entry_photo_path, r.exit_photo_path])
      .filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      const { error: rmErr } = await service.storage
        .from("checkin-photos")
        .remove(paths);
      if (rmErr) return { ok: false, error: rmErr.message };
    }

    const { error: upErr } = await service
      .from("floor_checkins")
      .update({ entry_photo_path: null, exit_photo_path: null })
      .in(
        "id",
        rows.map((r) => r.id),
      );
    if (upErr) return { ok: false, error: upErr.message };
    deleted += paths.length;
  }

  return { ok: true, deleted };
}
