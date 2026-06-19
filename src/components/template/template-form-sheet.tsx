"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTemplate, updateTemplate } from "@/server/templates";
import type { ShiftTemplate } from "@/types/db";
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

const schema = z
  .object({
    location_id: z.string().uuid("Pick a location."),
    name: z.string().trim().min(1, "Name is required."),
    start_time: z.string().regex(/^\d{2}:\d{2}/, "Required."),
    end_time: z.string().regex(/^\d{2}:\d{2}/, "Required."),
    default_headcount: z.coerce.number().int().min(0).max(50),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "Hex like #1ea7fd.")
      .optional()
      .or(z.literal("")),
  })
  .refine((d) => d.start_time < d.end_time, {
    message: "End time must be after start time.",
    path: ["end_time"],
  });
type FormValues = z.input<typeof schema>;

export function TemplateFormSheet({
  template,
  locations,
  children,
}: {
  template?: ShiftTemplate;
  locations: { id: string; name: string }[];
  children: React.ReactElement;
}) {
  const router = useRouter();
  const isEdit = Boolean(template);
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
      location_id: template?.location_id ?? locations[0]?.id ?? "",
      name: template?.name ?? "",
      start_time: template?.start_time?.slice(0, 5) ?? "09:00",
      end_time: template?.end_time?.slice(0, 5) ?? "17:00",
      default_headcount: template?.default_headcount ?? 1,
      color: template?.color ?? "",
    },
  });

  const locationId = watch("location_id");

  async function onSubmit(values: FormValues) {
    setPending(true);
    const payload = { ...values, active: template?.active ?? true };
    const res = isEdit
      ? await updateTemplate(template!.id, payload)
      : await createTemplate(payload);
    setPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(isEdit ? "Template updated." : "Template created.");
    setOpen(false);
    if (!isEdit) reset();
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={children} />
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit template" : "New template"}</SheetTitle>
          <SheetDescription>
            A recurring shift definition for a store.
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          noValidate
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="location_id">Location</Label>
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
            {errors.location_id && (
              <p className="text-destructive text-sm">
                {errors.location_id.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Morning" {...register("name")} />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="start_time">Start</Label>
              <Input id="start_time" type="time" {...register("start_time")} />
              {errors.start_time && (
                <p className="text-destructive text-sm">
                  {errors.start_time.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="end_time">End</Label>
              <Input id="end_time" type="time" {...register("end_time")} />
              {errors.end_time && (
                <p className="text-destructive text-sm">
                  {errors.end_time.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="default_headcount">Headcount</Label>
              <Input
                id="default_headcount"
                type="number"
                {...register("default_headcount")}
              />
              {errors.default_headcount && (
                <p className="text-destructive text-sm">
                  {errors.default_headcount.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="color">Color</Label>
              <div className="flex items-center gap-2">
                <Input id="color" placeholder="#1ea7fd" {...register("color")} />
                <span
                  aria-hidden
                  className="size-9 shrink-0 rounded-md border"
                  style={{ backgroundColor: watch("color") || "transparent" }}
                />
              </div>
              {errors.color && (
                <p className="text-destructive text-sm">
                  {errors.color.message}
                </p>
              )}
            </div>
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Create template"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
