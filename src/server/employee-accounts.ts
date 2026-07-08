"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth";
import { tempPassword } from "@/lib/temp-password";
import { sendSafe } from "@/lib/resend";
import { CredentialsEmail } from "@/lib/emails/credentials";
import { type ActionResult, dbError } from "@/server/shared";

const uuid = z.string().uuid();

export type IssuedCredentials = { password: string; email: string; emailed: boolean };

/**
 * Keep the temp password retrievable on the employee page until they change
 * it, and email it to them. Email failure isn't fatal — the admin sees the
 * password in the UI either way (and Resend only reaches the account owner
 * until a sending domain is verified).
 */
async function storeAndEmailCredentials(opts: {
  employeeId: string | null;
  name: string;
  email: string;
  password: string;
  actorId: string | null;
  isAdmin: boolean;
}): Promise<boolean> {
  const service = createServiceClient();
  if (opts.employeeId) {
    await service.from("employee_credentials").upsert({
      employee_id: opts.employeeId,
      temp_password: opts.password,
      set_by: opts.actorId,
      set_at: new Date().toISOString(),
    });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const sent = await sendSafe({
    to: opts.email,
    subject: "Your Live access — temporary password inside",
    react: CredentialsEmail({
      name: opts.name,
      email: opts.email,
      password: opts.password,
      loginUrl: `${appUrl}/login`,
      isAdmin: opts.isAdmin,
    }),
  });
  return sent.ok;
}

/**
 * Invite an employee to the portal: create their auth user (role=employee)
 * with a temporary password, link it, store + email the credentials, and
 * return the password once so the admin can hand it over directly.
 */
export async function inviteEmployee(
  employeeId: string,
): Promise<ActionResult<IssuedCredentials>> {
  const actor = await requireAdmin();
  if (!uuid.safeParse(employeeId).success) {
    return { ok: false, error: "Invalid employee id." };
  }

  const supabase = await createServerClient();
  const { data: emp, error } = await supabase
    .from("employees")
    .select("id, name, email, auth_user_id")
    .eq("id", employeeId)
    .single();
  if (error || !emp) return { ok: false, error: "Employee not found." };
  if (emp.auth_user_id) {
    return { ok: false, error: "This employee already has portal access." };
  }

  const service = createServiceClient();
  const password = tempPassword();
  const created = await service.auth.admin.createUser({
    email: emp.email,
    password,
    email_confirm: true,
    app_metadata: { role: "employee", employee_id: emp.id },
  });
  if (created.error || !created.data.user) {
    return { ok: false, error: created.error?.message ?? "Couldn't create the account." };
  }

  const linked = await service
    .from("employees")
    .update({ auth_user_id: created.data.user.id })
    .eq("id", emp.id);
  if (linked.error) return { ok: false, error: dbError(linked.error) };

  const emailed = await storeAndEmailCredentials({
    employeeId: emp.id,
    name: emp.name,
    email: emp.email,
    password,
    actorId: actor.id,
    isAdmin: false,
  });

  revalidatePath(`/admin/employees/${emp.id}`);
  return { ok: true, data: { password, email: emp.email, emailed } };
}

/**
 * Set (or reset) an employee's portal password directly — no email needed.
 * Creates their account if they don't have one yet. Returns the generated
 * password once for the admin to hand over; the employee can change it after
 * signing in. Admin-only.
 */
export async function setEmployeePassword(
  employeeId: string,
): Promise<ActionResult<IssuedCredentials>> {
  const actor = await requireAdmin();
  if (!uuid.safeParse(employeeId).success) {
    return { ok: false, error: "Invalid employee id." };
  }

  const supabase = await createServerClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("id, name, email, auth_user_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "Employee not found." };

  const service = createServiceClient();
  const password = tempPassword();

  if (emp.auth_user_id) {
    // email_confirm heals accounts from the old invite flow — Supabase refuses
    // password logins while email_confirmed_at is null.
    const upd = await service.auth.admin.updateUserById(emp.auth_user_id, {
      password,
      email_confirm: true,
    });
    if (upd.error) return { ok: false, error: upd.error.message };
  } else {
    const created = await service.auth.admin.createUser({
      email: emp.email,
      password,
      email_confirm: true,
      app_metadata: { role: "employee", employee_id: emp.id },
    });
    if (created.error || !created.data.user) {
      return { ok: false, error: created.error?.message ?? "Couldn't create the account." };
    }
    const linked = await service
      .from("employees")
      .update({ auth_user_id: created.data.user.id })
      .eq("id", emp.id);
    if (linked.error) return { ok: false, error: dbError(linked.error) };
  }

  const emailed = await storeAndEmailCredentials({
    employeeId: emp.id,
    name: emp.name,
    email: emp.email,
    password,
    actorId: actor.id,
    isAdmin: false,
  });

  revalidatePath(`/admin/employees/${emp.id}`);
  return { ok: true, data: { password, email: emp.email, emailed } };
}

/** Revoke portal access: delete the auth user and unlink. */
export async function revokeEmployeeAccess(
  employeeId: string,
): Promise<ActionResult> {
  await requireAdmin();
  if (!uuid.safeParse(employeeId).success) {
    return { ok: false, error: "Invalid employee id." };
  }

  const supabase = await createServerClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("id, auth_user_id")
    .eq("id", employeeId)
    .single();
  if (!emp?.auth_user_id) {
    return { ok: false, error: "This employee has no portal access." };
  }

  const service = createServiceClient();
  await service.auth.admin.deleteUser(emp.auth_user_id);
  await service.from("employee_credentials").delete().eq("employee_id", emp.id);
  const unlinked = await service
    .from("employees")
    .update({ auth_user_id: null })
    .eq("id", emp.id);
  if (unlinked.error) return { ok: false, error: dbError(unlinked.error) };

  revalidatePath(`/admin/employees/${emp.id}`);
  return { ok: true };
}

/** Current auth role of an employee's linked account, or null if no portal access. */
export async function getEmployeeAuthRole(
  employeeId: string,
): Promise<"admin" | "employee" | null> {
  await requireAdmin();
  if (!uuid.safeParse(employeeId).success) return null;

  const supabase = await createServerClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("auth_user_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp?.auth_user_id) return null;

  const service = createServiceClient();
  const { data, error } = await service.auth.admin.getUserById(
    emp.auth_user_id,
  );
  if (error || !data.user) return null;
  const role = (data.user.app_metadata as { role?: string } | undefined)?.role;
  return role === "admin" ? "admin" : "employee";
}

/**
 * Promote/demote a linked account between full admin and employee. The change
 * lands on the user's next token refresh / re-login (the JWT claim is cached).
 */
export async function setEmployeeAdmin(
  employeeId: string,
  makeAdmin: boolean,
): Promise<ActionResult> {
  const actor = await requireAdmin();
  if (!uuid.safeParse(employeeId).success) {
    return { ok: false, error: "Invalid employee id." };
  }

  const supabase = await createServerClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("id, auth_user_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp?.auth_user_id) {
    return { ok: false, error: "Invite this employee to the portal first." };
  }
  if (!makeAdmin && emp.auth_user_id === actor.id) {
    return { ok: false, error: "You can't remove your own admin access." };
  }

  const service = createServiceClient();
  const updated = await service.auth.admin.updateUserById(emp.auth_user_id, {
    app_metadata: {
      role: makeAdmin ? "admin" : "employee",
      employee_id: emp.id,
    },
  });
  if (updated.error) return { ok: false, error: updated.error.message };

  revalidatePath(`/admin/employees/${emp.id}`);
  return { ok: true };
}
