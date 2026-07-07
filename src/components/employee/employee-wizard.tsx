"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createEmployeeWithAccess } from "@/server/employees";
import { DIAL_CODES, DIAL_CODE_ITEMS, joinPhone } from "@/lib/dial-codes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES = [
  { value: "sales_rep", label: "Sales rep" },
  { value: "shift_lead", label: "Shift lead" },
  { value: "store_manager", label: "Store manager" },
] as const;
const ROLE_ITEMS: Record<string, string> = Object.fromEntries(
  ROLES.map((r) => [r.value, r.label]),
);

const schema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().email("Enter a valid email."),
  location_id: z.string().uuid("Pick a location."),
  role: z.enum(["sales_rep", "shift_lead", "store_manager"]),
  weekly_hour_target: z.coerce.number().int().min(0).max(80),
  max_days_per_week: z.coerce.number().int().min(1).max(7),
  weekly_days_off: z.coerce.number().int().min(0).max(6),
  hire_date: z.string().optional().or(z.literal("")),
  hourly_rate: z.string().optional().or(z.literal("")),
});
type FormValues = z.input<typeof schema>;

const STEPS = ["Profile", "Schedule rules", "Pay & access", "Review"];
const STEP_FIELDS: (keyof FormValues)[][] = [
  ["name", "email", "location_id", "role"],
  ["weekly_hour_target", "max_days_per_week", "weekly_days_off", "hire_date"],
  ["hourly_rate"],
  [],
];

export function EmployeeWizard({
  locations,
}: {
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [dialCode, setDialCode] = useState(DIAL_CODES[0].code);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [invite, setInvite] = useState(true);

  const {
    register,
    setValue,
    watch,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      email: "",
      location_id: locations[0]?.id ?? "",
      role: "sales_rep",
      weekly_hour_target: 40,
      max_days_per_week: 5,
      weekly_days_off: 2,
      hire_date: "",
      hourly_rate: "",
    },
  });

  const locationId = watch("location_id");
  const role = watch("role");

  async function next() {
    const ok = await trigger(STEP_FIELDS[step]);
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function create() {
    if (!(await trigger())) return;
    setPending(true);
    const v = getValues();
    const res = await createEmployeeWithAccess({
      ...v,
      phone: joinPhone(dialCode, phoneNumber),
      hourly_rate: v.hourly_rate ?? "",
      hire_date: v.hire_date ?? "",
      invite,
      active: true,
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      res.data?.invited ? "Employee created and invited." : "Employee created.",
    );
    if (res.data?.inviteError) {
      toast.error(`Invite couldn't be sent: ${res.data.inviteError}`);
    }
    router.push(`/admin/employees/${res.data!.id}`);
  }

  const v = watch();

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "rounded-md px-3 py-1",
              i === step
                ? "bg-primary text-primary-foreground"
                : i < step
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground",
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <Field label="Name" error={errors.name?.message} htmlFor="name">
            <Input id="name" {...register("name")} />
          </Field>
          <Field label="Email" error={errors.email?.message} htmlFor="email">
            <Input id="email" type="email" {...register("email")} />
          </Field>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Phone</Label>
            <div className="flex gap-2">
              <Select
                items={DIAL_CODE_ITEMS}
                value={dialCode}
                onValueChange={(c) => setDialCode(c ?? dialCode)}
              >
                <SelectTrigger className="w-28 shrink-0">
                  <SelectValue placeholder="Code" />
                </SelectTrigger>
                <SelectContent>
                  {DIAL_CODES.map((d) => (
                    <SelectItem key={d.code} value={d.code}>
                      {d.flag} {d.code} {d.country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="phone"
                inputMode="tel"
                placeholder="300 123 4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
          <Field
            label="Location"
            error={errors.location_id?.message}
            htmlFor="location_id"
          >
            <Select
              items={Object.fromEntries(locations.map((l) => [l.id, l.name]))}
              value={locationId}
              onValueChange={(val) =>
                setValue("location_id", val ?? "", { shouldValidate: true })
              }
            >
              <SelectTrigger id="location_id" className="w-full">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Role" error={errors.role?.message} htmlFor="role">
            <Select
              items={ROLE_ITEMS}
              value={role}
              onValueChange={(val) =>
                setValue("role", (val ?? "sales_rep") as FormValues["role"], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="role" className="w-full">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <Field
              label="Hours/wk"
              error={errors.weekly_hour_target?.message}
              htmlFor="weekly_hour_target"
            >
              <Input
                id="weekly_hour_target"
                type="number"
                {...register("weekly_hour_target")}
              />
            </Field>
            <Field
              label="Max days"
              error={errors.max_days_per_week?.message}
              htmlFor="max_days_per_week"
            >
              <Input
                id="max_days_per_week"
                type="number"
                {...register("max_days_per_week")}
              />
            </Field>
            <Field
              label="Days off"
              error={errors.weekly_days_off?.message}
              htmlFor="weekly_days_off"
            >
              <Input
                id="weekly_days_off"
                type="number"
                {...register("weekly_days_off")}
              />
            </Field>
          </div>
          <Field label="Hire date" error={errors.hire_date?.message} htmlFor="hire_date">
            <Input id="hire_date" type="date" {...register("hire_date")} />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <Field
            label="Hourly rate (private)"
            error={errors.hourly_rate?.message}
            htmlFor="hourly_rate"
          >
            <MoneyInput
              id="hourly_rate"
              placeholder="0.00"
              value={watch("hourly_rate") ?? ""}
              onValueChange={(v) =>
                setValue("hourly_rate", v, { shouldValidate: true })
              }
              className="w-40"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={invite}
              onChange={(e) => setInvite(e.target.checked)}
              className="size-4"
            />
            Send portal invite to {watch("email") || "their email"} now
          </label>
        </div>
      )}

      {step === 3 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Review label="Name" value={v.name} />
          <Review label="Email" value={v.email} />
          <Review label="Phone" value={joinPhone(dialCode, phoneNumber) || "—"} />
          <Review
            label="Location"
            value={locations.find((l) => l.id === v.location_id)?.name ?? "—"}
          />
          <Review label="Role" value={ROLE_ITEMS[v.role ?? ""] ?? "—"} />
          <Review
            label="Rules"
            value={`${v.weekly_hour_target}h · ≤${v.max_days_per_week}d · ≥${v.weekly_days_off} off`}
          />
          <Review label="Hourly rate" value={v.hourly_rate || "—"} />
          <Review label="Invite" value={invite ? "Yes" : "No"} />
        </dl>
      )}

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(s - 1, 0))}
          disabled={step === 0 || pending}
        >
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>Next</Button>
        ) : (
          <Button onClick={create} disabled={pending}>
            {pending ? "Creating…" : invite ? "Create & invite" : "Create"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  );
}
