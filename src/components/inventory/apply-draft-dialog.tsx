"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { applyPushDraft } from "@/server/inventory-push";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ApplyDraftDialog({
  draftId,
  rows,
  unitsUp,
  unitsDown,
  shopifyLocationName,
  disabledReason,
}: {
  draftId: string;
  rows: number;
  unitsUp: number;
  unitsDown: number;
  shopifyLocationName: string;
  disabledReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  function apply() {
    setPending(true);
    applyPushDraft(draftId).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
        return;
      }
      toast.success(`Shopify updated — ${res.data?.written ?? rows} rows written.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogTrigger
          render={
            <Button disabled={!!disabledReason || rows === 0}>
              <UploadCloud className="mr-1.5 size-4" /> Write to Shopify
            </Button>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Write {rows} corrections to Shopify?</DialogTitle>
            <DialogDescription>
              Shopify&apos;s stock at {shopifyLocationName} becomes the book&apos;s
              numbers: {unitsUp} units up, {unitsDown} down. Shopify records each
              change as a correction. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button onClick={apply} disabled={pending}>
              {pending ? "Writing…" : "Write to Shopify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {disabledReason && (
        <p className="text-muted-foreground text-xs">{disabledReason}</p>
      )}
      {!disabledReason && rows === 0 && (
        <p className="text-muted-foreground text-xs">Every row is excluded.</p>
      )}
    </div>
  );
}
