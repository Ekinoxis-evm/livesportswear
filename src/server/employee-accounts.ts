"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth";
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
    .select("id, email, auth_user_id")
    .eq("id", employeeId)
    .single();
  if (error || !emp) return { ok: false, error: "Employee not found." };
  if (emp.auth_user_id) {
    return { ok: false, error: "This employee already has portal access." };
  }

  const service = createServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const invited = await service.auth.admin.inviteUserByEmail(emp.email, {
    redirectTo: `${appUrl}/login`,
  });
  if (invited.error || !invited.data.user) {
    return { ok: false, error: invited.error?.message ?? "Couldn't invite." };
  }

  const userId = invited.data.user.id;
  const claimed = await service.auth.admin.updateUserById(userId, {
    app_metadata: { role: "employee", employee_id: emp.id },
  });
  if (claimed.error) return { ok: false, error: claimed.error.message };

  const linked = await service
    .from("employees")
    .update({ auth_user_id: userId })
    .eq("id", emp.id);
  if (linked.error) return { ok: false, error: dbError(linked.error) };

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
