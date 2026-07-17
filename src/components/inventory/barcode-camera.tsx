"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// The Shape Detection API isn't in TS's dom lib yet.
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

function getDetectorCtor(): BarcodeDetectorCtor | null {
  return (
    (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null
  );
}

/**
 * Rear-camera barcode scanning via the native BarcodeDetector API (Chrome /
 * Android / Edge). Where the API doesn't exist (iOS Safari), the dialog says
 * so — the external scanner and manual typing always work.
 */
export function BarcodeCamera({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastHit, setLastHit] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && getDetectorCtor() !== null;

  useEffect(() => {
    if (!open || !supported) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    // The same code stays in frame for many detect() ticks — count it once
    // until a different code appears or 1.5s passes.
    let lastCode = "";
    let lastAt = 0;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const Ctor = getDetectorCtor();
        if (!Ctor) return;
        const detector = new Ctor({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"],
        });
        timer = setInterval(async () => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          try {
            const codes = await detector.detect(video);
            const code = codes[0]?.rawValue;
            if (!code) return;
            const now = Date.now();
            if (code === lastCode && now - lastAt < 1500) return;
            lastCode = code;
            lastAt = now;
            setLastHit(code);
            onScan(code);
            if (navigator.vibrate) navigator.vibrate(80);
          } catch {
            // detect() can throw while the stream warms up — just skip the tick
          }
        }, 250);
      } catch {
        if (!cancelled) {
          setError("Camera unavailable — allow camera access and try again.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setLastHit(null);
      setError(null);
    };
  }, [open, supported, onScan]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan with the camera</DialogTitle>
          <DialogDescription>
            Point at the barcode — every new code counts one unit.
          </DialogDescription>
        </DialogHeader>
        {!supported ? (
          <p className="text-muted-foreground text-sm">
            This browser can&apos;t scan barcodes with the camera (iPhone Safari
            doesn&apos;t support it yet). Use an external scanner or type the
            number — or open this page in Chrome on Android.
          </p>
        ) : error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="aspect-video w-full rounded-lg border object-cover"
            />
            {lastHit && (
              <p className="text-center text-sm">
                Last scan:{" "}
                <span className="font-semibold tabular-nums">{lastHit}</span>
              </p>
            )}
          </>
        )}
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
