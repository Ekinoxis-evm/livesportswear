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
  detect(source: HTMLVideoElement | HTMLCanvasElement): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

function getNativeCtor(): BarcodeDetectorCtor | null {
  return (
    (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null
  );
}

// The scan zone as fractions of the frame — mirrored by the overlay div and
// the detection crop, so "inside the box" is exactly what gets decoded.
const ZONE = { x: 0.1, y: 0.3, w: 0.8, h: 0.4 };

/**
 * Rear-camera barcode scanning. Native BarcodeDetector where it exists
 * (Chrome / Android / Edge); elsewhere (iOS Safari) the zxing-wasm ponyfill
 * is loaded on first open — dynamic import so capable browsers never
 * download the WASM. Detection runs on a crop of the highlighted scan zone:
 * small clothing-tag codes decode far more reliably on a tight crop than on
 * the whole busy frame.
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastHit, setLastHit] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [ctor, setCtor] = useState<BarcodeDetectorCtor | null>(() => getNativeCtor());
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!open || ctor || loadFailed) return;
    let cancelled = false;
    import("barcode-detector/ponyfill")
      .then((mod) => {
        if (cancelled) return;
        setCtor(() => mod.BarcodeDetector as unknown as BarcodeDetectorCtor);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, ctor, loadFailed]);

  useEffect(() => {
    if (!open || !ctor) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let flashTimer: ReturnType<typeof setTimeout> | null = null;
    // The same code stays in frame for many detect() ticks — count it once
    // until a different code appears or 1.5s passes.
    let lastCode = "";
    let lastAt = 0;
    let misses = 0;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
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
        const detector = new ctor({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"],
        });
        timer = setInterval(async () => {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !video.videoWidth) return;
          try {
            if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
            const canvas = canvasRef.current;
            const sx = ZONE.x * video.videoWidth;
            const sy = ZONE.y * video.videoHeight;
            const sw = ZONE.w * video.videoWidth;
            const sh = ZONE.h * video.videoHeight;
            canvas.width = sw;
            canvas.height = sh;
            canvas.getContext("2d")?.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

            let codes = await detector.detect(canvas);
            if (!codes.length) {
              // Forgiving fallback: every 3rd miss, also try the full frame.
              misses++;
              if (misses % 3 === 0) codes = await detector.detect(video);
            }
            const code = codes[0]?.rawValue;
            if (!code) return;
            misses = 0;
            const now = Date.now();
            if (code === lastCode && now - lastAt < 1500) return;
            lastCode = code;
            lastAt = now;
            setLastHit(code);
            setFlash(true);
            if (flashTimer) clearTimeout(flashTimer);
            flashTimer = setTimeout(() => setFlash(false), 600);
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
      if (flashTimer) clearTimeout(flashTimer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setLastHit(null);
      setError(null);
      setFlash(false);
    };
  }, [open, ctor, onScan]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan with the camera</DialogTitle>
          <DialogDescription>Fit the barcode inside the box.</DialogDescription>
        </DialogHeader>
        {loadFailed ? (
          <p className="text-muted-foreground text-sm">
            The barcode reader couldn&apos;t load — check the connection and
            reopen, or use an external scanner / type the number.
          </p>
        ) : error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : !ctor ? (
          <p className="text-muted-foreground text-sm">Starting the camera…</p>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-lg border">
              <video ref={videoRef} playsInline muted className="w-full" />
              <div
                aria-hidden
                className={
                  "absolute rounded-md border-2 transition-colors " +
                  (flash ? "border-emerald-400" : "border-white/70")
                }
                style={{
                  left: `${ZONE.x * 100}%`,
                  top: `${ZONE.y * 100}%`,
                  width: `${ZONE.w * 100}%`,
                  height: `${ZONE.h * 100}%`,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
                }}
              />
            </div>
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
