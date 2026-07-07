"use client";

import { useState } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function PinPad({
  open,
  title,
  subtitle,
  pending,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  pending: boolean;
  onSubmit: (pin: string) => void;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");

  const press = (d: string) => {
    if (pending) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      onSubmit(next);
      setPin("");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setPin("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>

        <div className="flex justify-center gap-3 py-2" aria-label="PIN">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "size-3.5 rounded-full border-2",
                i < pin.length ? "bg-primary border-primary" : "border-muted-foreground/40",
              )}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((d) => (
            <Button
              key={d}
              type="button"
              variant="outline"
              disabled={pending}
              className="h-14 text-xl font-semibold"
              onClick={() => press(d)}
            >
              {d}
            </Button>
          ))}
          <span />
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="h-14 text-xl font-semibold"
            onClick={() => press("0")}
          >
            0
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            aria-label="Delete digit"
            className="h-14"
            onClick={() => setPin((p) => p.slice(0, -1))}
          >
            <Delete className="size-5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
