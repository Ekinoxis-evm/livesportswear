"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScanBarcode } from "lucide-react";
import { startCount } from "@/server/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type LocationOption = { id: string; name: string; hasOpen: boolean };

export function StartCountButton({ locations }: { locations: LocationOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState(
    locations.find((l) => !l.hasOpen)?.id ?? locations[0]?.id ?? "",
  );
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await startCount({ locationId, note: note.trim() || undefined });
      if (res.ok && res.data) {
        router.push(`/admin/inventory/${res.data.id}`);
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });

  if (locations.length === 0) return null;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <ScanBarcode className="mr-1.5 size-4" /> Start a count
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start an inventory count</DialogTitle>
            <DialogDescription>
              One open count per store — scans add up until you finalize it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label>Store</Label>
            <div className="flex flex-wrap gap-2">
              {locations.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={pending || l.hasOpen}
                  onClick={() => setLocationId(l.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm",
                    l.id === locationId
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                    l.hasOpen && "cursor-not-allowed opacity-50",
                  )}
                >
                  {l.name}
                  {l.hasOpen && " · counting"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="count-note">Note (optional)</Label>
            <Input
              id="count-note"
              maxLength={300}
              placeholder="e.g. July full count"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button disabled={pending || !locationId} onClick={submit}>
            Start counting
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
