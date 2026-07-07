import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type { Employee } from "@/types/db";

export type Role = "admin" | "employee" | "store";

/** Role from the Supabase JWT claim app_metadata.role. */
export function roleOf(user: User | null): Role | null {
  const r = (user?.app_metadata as { role?: string } | undefined)?.role;
  return r === "admin" || r === "employee" || r === "store" ? r : null;
}

/** A master admin (no admin_scope claim, or 'master') sees every location. */
export function isMasterAdmin(user: User | null): boolean {
  if (roleOf(user) !== "admin") return false;
  const scope = (user?.app_metadata as { admin_scope?: string } | undefined)
    ?.admin_scope;
  return !scope || scope === "master";
}

export async function getSessionUser(): Promise<User | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Back-compat alias. */
export async function getAdminUser(): Promise<User | null> {
  return getSessionUser();
}

/** Guard for admin pages/actions. Sends employees to their portal. */
export async function requireAdmin(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roleOf(user) !== "admin") redirect("/portal");
  return user;
}

/** Guard for master-admin-only actions (managing admins, shared config). */
export async function requireMasterAdmin(): Promise<User> {
  const user = await requireAdmin();
  if (!isMasterAdmin(user)) redirect("/admin/dashboard");
  return user;
}

/** Location ids the current admin may manage (all, for a master admin). */
export async function accessibleLocationIds(): Promise<string[] | "all"> {
  const user = await getSessionUser();
  if (isMasterAdmin(user)) return "all";
  if (!user) return [];
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("admin_locations")
    .select("location_id")
    .eq("admin_user_id", user.id);
  return (data ?? []).map((r) => r.location_id);
}

/**
 * Guard for the shared store screen. A store account is per-location, not
 * per-person — its identity is the location_id claim, never an employees row.
 */
export async function requireStore(): Promise<{
  user: User;
  locationId: string;
}> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roleOf(user) !== "store") redirect("/");
  const locationId = (user.app_metadata as { location_id?: string })
    .location_id;
  if (!locationId) redirect("/login");
  return { user, locationId };
}

/** Guard for the employee portal; returns the linked employee row. */
export async function requireEmployee(): Promise<{
  user: User;
  employee: Employee;
}> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!employee) redirect("/login");

  return { user, employee };
}
