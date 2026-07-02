import { formatInTimeZone } from "date-fns-tz";
import { ShieldQuestion, ShieldX } from "lucide-react";
import { requireEmployee } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { ValidateButton } from "@/components/portal/validate-button";

type ValidationRow = {
  kind: string;
  used_at: string | null;
  floor_checkins: {
    employee_id: string;
    location_id: string;
    business_date: string;
    arrived_at: string;
    left_at: string | null;
    employees: { name: string } | null;
  };
};

function Invalid() {
  return (
    <div className="bg-card flex flex-col items-center gap-3 rounded-2xl border p-8 text-center">
      <ShieldX className="text-muted-foreground size-7" />
      <p className="font-semibold">This validation link is no longer valid.</p>
      <p className="text-muted-foreground text-sm">
        It may have been used already, or a new QR was generated.
      </p>
    </div>
  );
}

export default async function ValidatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { employee } = await requireEmployee();
  const service = createServiceClient();

  const { data } = await service
    .from("attendance_validations")
    .select(
      "kind, used_at, floor_checkins!inner(employee_id, location_id, business_date, arrived_at, left_at, employees(name))",
    )
    .eq("token", token)
    .maybeSingle();
  const val = data as ValidationRow | null;
  const checkin = val?.floor_checkins;

  const { data: loc } = await service
    .from("locations")
    .select("timezone")
    .eq("id", employee.location_id)
    .maybeSingle();
  const tz = loc?.timezone ?? "UTC";

  if (
    !val ||
    val.used_at ||
    !checkin ||
    checkin.location_id !== employee.location_id ||
    checkin.business_date !== businessDate(tz)
  ) {
    return <Invalid />;
  }

  const name = checkin.employees?.name ?? "your coworker";
  const isEntry = val.kind === "entry";
  const at = isEntry ? checkin.arrived_at : (checkin.left_at ?? checkin.arrived_at);
  const timeLabel = formatInTimeZone(new Date(at), tz, "HH:mm");
  const isSelf = checkin.employee_id === employee.id;

  return (
    <div className="bg-card flex flex-col items-center gap-4 rounded-2xl border p-8 text-center">
      <ShieldQuestion className="text-primary size-7" />
      <div>
        <p className="text-lg font-semibold">
          Confirm that {name} {isEntry ? "arrived" : "left"} at {timeLabel}?
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          You&apos;re vouching that you saw them {isEntry ? "arrive at" : "leave"} the
          store.
        </p>
      </div>
      {isSelf ? (
        <p className="text-muted-foreground text-sm">
          You can&apos;t validate your own {isEntry ? "entry" : "exit"} — hand this to a
          coworker.
        </p>
      ) : (
        <ValidateButton
          token={token}
          label={isEntry ? "Confirm arrival" : "Confirm exit"}
        />
      )}
    </div>
  );
}
