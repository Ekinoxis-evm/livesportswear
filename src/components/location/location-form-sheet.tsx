"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLocation, updateLocation } from "@/server/locations";
import { COMMON_TIMEZONES } from "@/lib/timezones";
import { slugify } from "@/lib/utils";
import type { Location } from "@/types/db";
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

const schema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Lowercase letters, numbers, and hyphens only.",
    ),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  postal_code: z.string().trim().max(20).optional(),
  timezone: z.string().min(1, "Pick a timezone."),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Hex like #1ea7fd.")
    .optional()
    .or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

export function LocationFormSheet({
  location,
  children,
}: {
  location?: Location;
  children: React.ReactElement;
}) {
  const router = useRouter();
  const isEdit = Boolean(location);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

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
      name: location?.name ?? "",
      slug: location?.slug ?? "",
      address: location?.address ?? "",
      city: location?.city ?? "",
      state: location?.state ?? "",
      country: location?.country ?? "",
      postal_code: location?.postal_code ?? "",
      timezone: location?.timezone ?? "America/New_York",
      color: location?.color ?? "",
    },
  });

  const nameReg = register("name");
  const slugReg = register("slug");
  const timezone = watch("timezone");

  async function onSubmit(values: FormValues) {
    setPending(true);
    const payload = {
      ...values,
      address: values.address ?? "",
      city: values.city ?? "",
      state: values.state ?? "",
      country: values.country ?? "",
      postal_code: values.postal_code ?? "",
      color: values.color ?? "",
      active: location?.active ?? true,
    };
    const res = isEdit
      ? await updateLocation(location!.id, payload)
      : await createLocation(payload);
    setPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(isEdit ? "Location updated." : "Location created.");
    setOpen(false);
    if (!isEdit) {
      reset();
      setSlugTouched(false);
    }
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={children} />
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit location" : "New location"}</SheetTitle>
          <SheetDescription>A physical Live Active Wear store.</SheetDescription>
        </SheetHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          noValidate
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              {...nameReg}
              onChange={(e) => {
                nameReg.onChange(e);
                if (!isEdit && !slugTouched) {
                  setValue("slug", slugify(e.target.value), {
                    shouldValidate: true,
                  });
                }
              }}
            />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              {...slugReg}
              onChange={(e) => {
                setSlugTouched(true);
                slugReg.onChange(e);
              }}
            />
            {errors.slug && (
              <p className="text-destructive text-sm">{errors.slug.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={timezone}
              onValueChange={(v) =>
                setValue("timezone", v ?? "", { shouldValidate: true })
              }
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.timezone && (
              <p className="text-destructive text-sm">
                {errors.timezone.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="address">Street address</Label>
            <Input id="address" {...register("address")} placeholder="731 Lincoln Road" />
            {errors.address && (
              <p className="text-destructive text-sm">
                {errors.address.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register("city")} placeholder="Miami Beach" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="state">State / region</Label>
              <Input id="state" {...register("state")} placeholder="FL" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="postal_code">ZIP / postal code</Label>
              <Input id="postal_code" {...register("postal_code")} placeholder="33139" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" {...register("country")} placeholder="USA" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="color">Badge color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="color"
                placeholder="#1ea7fd"
                {...register("color")}
                className="flex-1"
              />
              <span
                aria-hidden
                className="size-9 shrink-0 rounded-md border"
                style={{ backgroundColor: watch("color") || "transparent" }}
              />
            </div>
            {errors.color && (
              <p className="text-destructive text-sm">{errors.color.message}</p>
            )}
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Create location"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
