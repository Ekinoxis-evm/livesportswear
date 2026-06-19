"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createEmployee, updateEmployee } from "@/server/employees";
import { WEEKDAYS, shortWeekday } from "@/lib/weekdays";
import { cn } from "@/lib/utils";
import type { Employee } from "@/types/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const schema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().email("Enter a valid email."),
  phone: z.string().trim().optional(),
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
  preferred_days_off: z.array(z.string()),
  hire_date: z.string().optional().or(z.literal("")),
});
type FormValues = z.input<typeof schema>;

export function EmployeeFormSheet({
  employee,
  locations,
  children,
}: {
  employee?: Employee;
  locations: { id: string; name: string }[];
  children: React.ReactElement;
}) {
  const router = useRouter();
  const isEdit = Boolean(employee);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

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
      phone: employee?.phone ?? "",
      location_id: employee?.location_id ?? locations[0]?.id ?? "",
      role: employee?.role ?? "sales_rep",
      avatar_color: employee?.avatar_color ?? "",
      weekly_hour_target: employee?.weekly_hour_target ?? 40,
      max_days_per_week: employee?.max_days_per_week ?? 5,
      weekly_days_off: employee?.weekly_days_off ?? 2,
      preferred_days_off: employee?.preferred_days_off ?? [],
      hire_date: employee?.hire_date ?? "",
    },
  });

  const locationId = watch("location_id");
  const role = watch("role");
  const preferred = watch("preferred_days_off");

  function toggleDay(day: string) {
    const next = preferred.includes(day)
      ? preferred.filter((d) => d !== day)
      : [...preferred, day];
    setValue("preferred_days_off", next, { shouldValidate: true });
  }

  async function onSubmit(values: FormValues) {
    setPending(true);
    const payload = { ...values, active: employee?.active ?? true };
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

          <Field label="Phone" error={errors.phone?.message} htmlFor="phone">
            <Input id="phone" {...register("phone")} />
          </Field>

          <Field
            label="Location"
            error={errors.location_id?.message}
            htmlFor="location_id"
          >
            <Select
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

          <div className="flex flex-col gap-2">
            <Label>Preferred days off</Label>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((day) => {
                const on = preferred.includes(day);
                return (
                  <Button
                    key={day}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    onClick={() => toggleDay(day)}
                    className={cn("w-12", on && "font-semibold")}
                  >
                    {shortWeekday(day)}
                  </Button>
                );
              })}
            </div>
          </div>

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
