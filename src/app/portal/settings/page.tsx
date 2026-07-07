import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/commission";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyButton } from "@/components/shared/copy-button";
import { PhotoUpload } from "@/components/portal/photo-upload";
import { PhoneForm } from "@/components/portal/phone-form";
import { EmailForm } from "@/components/portal/email-form";
import { ChangePasswordCard } from "@/components/portal/change-password";
import { KioskPinForm } from "@/components/portal/kiosk-pin-form";
import { shortDate } from "@/lib/format-date";

const ROLE_LABELS: Record<string, string> = {
  sales_rep: "Sales rep",
  shift_lead: "Shift lead",
  store_manager: "Store manager",
};

export default async function SettingsPage() {
  const { employee } = await requireEmployee();
  const supabase = await createServerClient();

  const [{ data: location }, { data: compRow }, { data: cfg }] = await Promise.all([
    supabase
      .from("locations")
      .select("name")
      .eq("id", employee.location_id)
      .maybeSingle(),
    supabase
      .from("employee_compensation")
      .select("hourly_rate")
      .eq("employee_id", employee.id)
      .maybeSingle(),
    supabase.from("commission_config").select("currency").eq("id", 1).maybeSingle(),
  ]);
  const hourlyRate = compRow?.hourly_rate ?? null;
  const currency = cfg?.currency ?? "USD";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const scheduleUrl = `${appUrl}/s/${employee.magic_token}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>
            Name and email are managed by your admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <PhotoUpload avatarUrl={employee.avatar_url} name={employee.name} />
            <div className="text-right">
              <p className="font-semibold">{employee.name}</p>
              <p className="text-muted-foreground text-sm">
                {ROLE_LABELS[employee.role] ?? employee.role} ·{" "}
                {location?.name ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 text-sm">
            {employee.hire_date && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Hire date</span>
                <span>{shortDate(employee.hire_date)}</span>
              </div>
            )}
            {hourlyRate != null && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Hourly rate</span>
                <span className="tabular-nums">
                  {formatMoney(hourlyRate, currency)} / h
                </span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">My setup</span>
              <span className="tabular-nums">
                {employee.weekly_hour_target}h · ≤{employee.max_days_per_week} days ·
                ≥{employee.weekly_days_off} off
              </span>
            </div>
          </div>
          <PhoneForm phone={employee.phone} />
        </CardContent>
      </Card>

      <EmailForm email={employee.email} />

      <KioskPinForm hasPin={Boolean(employee.kiosk_pin_hash)} />

      <ChangePasswordCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My schedule links</CardTitle>
          <CardDescription>
            Your personal schedule page and calendar feed — no login needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Schedule page</span>
            <CopyButton value={scheduleUrl} label="Copy link" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Calendar feed (.ics)</span>
            <CopyButton value={`${scheduleUrl}/calendar.ics`} label="Copy link" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
