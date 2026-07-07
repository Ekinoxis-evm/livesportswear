"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createEmployee, updateEmployee } from "@/server/employees";
import {
  DIAL_CODES,
  DIAL_CODE_ITEMS,
  splitPhone,
  joinPhone,
} from "@/lib/dial-codes";
import type { Employee } from "@/types/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  avatar_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Hex like #1ea7fd.")
    .optional()
    .or(z.literal("")),
  weekly_hour_target: z.coerce.number().int().min(0).max(80),
  max_days_per_week: z.coerce.number().int().min(1).max(7),
  weekly_days_off: z.coerce.number().int().min(0).max(6),
  hire_date: z.string().optional().or(z.literal("")),
  hourly_rate: z.string().optional().or(z.literal("")),
});
type FormValues = z.input<typeof schema>;

export function EmployeeFormSheet({
  employee,
  hourlyRate,
  locations,
  children,
}: {
  employee?: Employee;
  hourlyRate?: number | null;
  locations: { id: string; name: string }[];
  children: React.ReactElement;
}) {
  const router = useRouter();
  const isEdit = Boolean(employee);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const initialPhone = splitPhone(employee?.phone);
  const [dialCode, setDialCode] = useState(initialPhone.dialCode);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone.number);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: employee?.name ?? "",
      email: employee?.email ?? "",
      location_id: employee?.location_id ?? locations[0]?.id ?? "",
      role: employee?.role ?? "sales_rep",
      avatar_color: employee?.avatar_color ?? "",
      weekly_hour_target: employee?.weekly_hour_target ?? 40,
      max_days_per_week: employee?.max_days_per_week ?? 5,
      weekly_days_off: employee?.weekly_days_off ?? 2,
      hire_date: employee?.hire_date ?? "",
      hourly_rate: hourlyRate != null ? String(hourlyRate) : "",
    },
  });

  const locationId = watch("location_id");
  const role = watch("role");

  async function onSubmit(values: FormValues) {
    setPending(true);
    const payload = {
      ...values,
      phone: joinPhone(dialCode, phoneNumber),
      active: employee?.active ?? true,
    };
    const res = isEdit
      ? await updateEmployee(employee!.id, payload)
      : await createEmployee(payload);
    setPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(isEdit ? "Employee updated." : "Employee added.");
    setOpen(false);
    if (!isEdit) reset();
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={children} />
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit employee" : "New employee"}</SheetTitle>
          <SheetDescription>
            Rules here drive schedule validation.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          noValidate
        >
          <Field label="Name" error={errors.name?.message} htmlFor="name">
            <Input id="name" {...register("name")} />
          </Field>

          <Field label="Email" error={errors.email?.message} htmlFor="email">
            <Input id="email" type="email" {...register("email")} />
            {isEdit && (
              <p className="text-muted-foreground text-xs">
                Changing the email rotates the schedule link.
              </p>
            )}
          </Field>

          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Phone</Label>
            <div className="flex gap-2">
              <Select
                items={DIAL_CODE_ITEMS}
                value={dialCode}
                onValueChange={(v) => setDialCode(v ?? dialCode)}
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
              onValueChange={(v) =>
                setValue("location_id", v ?? "", { shouldValidate: true })
              }
            >
              <SelectTrigger id="location_id" className="w-full">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Role" error={errors.role?.message} htmlFor="role">
            <Select
              items={ROLE_ITEMS}
              value={role}
              onValueChange={(v) =>
                setValue(
                  "role",
                  (v ?? "sales_rep") as FormValues["role"],
                  { shouldValidate: true },
                )
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

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Hire date"
              error={errors.hire_date?.message}
              htmlFor="hire_date"
            >
              <Input id="hire_date" type="date" {...register("hire_date")} />
            </Field>
            <Field
              label="Avatar color"
              error={errors.avatar_color?.message}
              htmlFor="avatar_color"
            >
              <div className="flex items-center gap-2">
                <Input
                  id="avatar_color"
                  placeholder="#1ea7fd"
                  {...register("avatar_color")}
                />
                <span
                  aria-hidden
                  className="size-9 shrink-0 rounded-md border"
                  style={{ backgroundColor: watch("avatar_color") || "transparent" }}
                />
              </div>
            </Field>
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add employee"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
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
