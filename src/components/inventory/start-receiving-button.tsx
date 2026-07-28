"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackagePlus } from "lucide-react";
import { startReceiving } from "@/server/receiving";
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

export function StartReceivingButton({ locations }: { locations: LocationOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState(
    locations.find((l) => !l.hasOpen)?.id ?? locations[0]?.id ?? "",
  );
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await startReceiving({ locationId, note: note.trim() || undefined });
      if (res.ok && res.data) {
        router.push(`/admin/inventory/${res.data.id}`);
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });

  if (locations.length === 0) return null;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PackagePlus className="mr-1.5 size-4" /> New Stock
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receive new stock</DialogTitle>
            <DialogDescription>
              Upload the arrival document, verify what came in, then add it on top of
              current Shopify stock.
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
                  {l.hasOpen && " · receiving"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receive-note">Note (optional)</Label>
            <Input
              id="receive-note"
              maxLength={300}
              placeholder="e.g. PO 4471 · Sepia drop"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button disabled={pending || !locationId} onClick={submit}>
            Start receiving
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
