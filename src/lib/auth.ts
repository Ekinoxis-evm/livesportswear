import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type { Employee } from "@/types/db";

export type Role = "admin" | "employee";

/** Role from the Supabase JWT claim app_metadata.role. */
export function roleOf(user: User | null): Role | null {
  const r = (user?.app_metadata as { role?: string } | undefined)?.role;
  return r === "admin" || r === "employee" ? r : null;
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
