"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth";
import { sendSafe } from "@/lib/resend";
import { InviteEmail } from "@/lib/emails/invite";
import { type ActionResult, dbError } from "@/server/shared";

const uuid = z.string().uuid();

/** Invite an employee to the portal: create their auth user (role=employee) and link it. */
export async function inviteEmployee(employeeId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!uuid.safeParse(employeeId).success) {
    return { ok: false, error: "Invalid employee id." };
  }

  const supabase = await createServerClient();
  const { data: emp, error } = await supabase
    .from("employees")
    .select("id, name, email, auth_user_id, locations(name)")
    .eq("id", employeeId)
    .single();
  if (error || !emp) return { ok: false, error: "Employee not found." };
  if (emp.auth_user_id) {
    return { ok: false, error: "This employee already has portal access." };
  }

  const service = createServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Generate the invite link ourselves (instead of inviteUserByEmail) so we can
  // deliver it through Resend rather than Supabase's built-in SMTP.
  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: "invite",
    email: emp.email,
    options: { redirectTo: `${appUrl}/reset-password` },
  });
  if (linkErr || !link.user || !link.properties) {
    return { ok: false, error: linkErr?.message ?? "Couldn't create the invite." };
  }

  const userId = link.user.id;
  const claimed = await service.auth.admin.updateUserById(userId, {
    app_metadata: { role: "employee", employee_id: emp.id },
  });
  if (claimed.error) return { ok: false, error: claimed.error.message };

  const linked = await service
    .from("employees")
    .update({ auth_user_id: userId })
    .eq("id", emp.id);
  if (linked.error) return { ok: false, error: dbError(linked.error) };

  const sent = await sendSafe({
    to: emp.email,
    subject: "Set up your Live team portal access",
    react: InviteEmail({
      employeeName: emp.name,
      actionUrl: link.properties.action_link,
      locationName: emp.locations?.name,
    }),
  });
  if (!sent.ok) {
    // Account exists now; surface a soft error so the admin can resend.
    return { ok: false, error: `Account created, but the email failed: ${sent.error}` };
  }

  revalidatePath(`/admin/employees/${emp.id}`);
  return { ok: true };
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
