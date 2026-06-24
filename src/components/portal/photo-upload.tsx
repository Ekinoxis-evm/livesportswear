"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateOwnPhoto } from "@/server/profile";
import { Button } from "@/components/ui/button";

export function PhotoUpload({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null;
  name: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("photo", file);
    setPending(true);
    const res = await updateOwnPhoto(fd);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Photo updated.");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4">
      <span className="bg-muted flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="size-full object-cover" />
        ) : (
          <span className="text-muted-foreground text-lg font-medium">
            {name.charAt(0)}
          </span>
        )}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={onChange}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? "Uploading…" : "Change photo"}
      </Button>
    </div>
  );
}
