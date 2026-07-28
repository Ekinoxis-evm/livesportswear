"use client";

import { useEffect, useRef, useState } from "react";
import { Flashlight, FlashlightOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// `torch` isn't in TS's MediaTrackCapabilities yet, so this is a standalone
// shape we cast to (through unknown) rather than an intersection, whose base
// getCapabilities() would otherwise win and hide `torch`.
type Track = {
  getCapabilities?: () => { torch?: boolean };
  applyConstraints?: (c: { advanced?: { torch?: boolean }[] }) => Promise<void>;
};
const asTrack = (t: MediaStreamTrack | undefined) =>
  t as unknown as Track | undefined;

/**
 * Rear-camera barcode scanning. Native BarcodeDetector where it exists
 * (Chrome / Android / Edge); on iOS Safari the zxing-wasm ponyfill.
 *
 * The WASM is served from OUR origin (`public/zxing/`), not the package's
 * default `fastly.jsdelivr.net` CDN. That CDN is blocked by the app CSP
 * (`connect-src 'self' …supabase`), so on iOS the reader silently failed to
 * load and the camera "worked" but never decoded. `setZXingModuleOverrides`
 * repoints `locateFile` at the self-hosted copy.
 *
 * Failures are surfaced, not swallowed, and there's always a manual-entry
 * fallback + a torch toggle so a rep is never stuck on a tag that won't scan.
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
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [manual, setManual] = useState("");

  // Load the ponyfill on iOS, pointing its WASM at the self-hosted copy.
  useEffect(() => {
    if (!open || ctor || loadFailed) return;
    let cancelled = false;
    import("barcode-detector/ponyfill")
      .then((mod) => {
        if (cancelled) return;
        // locateFile receives the bare filename (e.g. "zxing_reader.wasm").
        mod.setZXingModuleOverrides?.({
          locateFile: (path: string, prefix: string) =>
            path.endsWith(".wasm") ? `/zxing/${path}` : prefix + path,
        });
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
    let lastCode = "";
    let lastAt = 0;
    let misses = 0;
    let decodeErrors = 0;

    (async () => {
      // Prefer 1080p, but many iPads reject a hard resolution and hand back an
      // empty stream — fall back to plain environment-facing, then any camera.
      const attempts: MediaStreamConstraints[] = [
        { video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        { video: { facingMode: "environment" }, audio: false },
        { video: true, audio: false },
      ];
      let stream: MediaStream | null = null;
      for (const c of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch {
          // try the next, looser constraint
        }
      }
      if (!stream) {
        if (!cancelled) setError("Camera unavailable — allow camera access, then reopen.");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const track = asTrack(stream.getVideoTracks()[0]);
      setHasTorch(Boolean(track?.getCapabilities?.().torch));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // iOS can reject play() until the element is on screen; the interval
          // below retries reading frames once it's ready.
        }
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
            misses++;
            if (misses % 3 === 0) codes = await detector.detect(video);
          }
          decodeErrors = 0;
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
          // A few transient throws while the stream warms up are normal, but a
          // sustained run means the decoder never came up (e.g. the WASM was
          // blocked). Surface it instead of a forever-dead preview.
          decodeErrors++;
          if (decodeErrors === 12 && !cancelled) {
            setError(
              "The barcode reader isn't working on this device — use an external scanner or type the number below.",
            );
          }
        }
      }, 250);
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
      setTorchOn(false);
      setHasTorch(false);
    };
  }, [open, ctor, onScan]);

  async function toggleTorch() {
    const track = asTrack(streamRef.current?.getVideoTracks()[0]);
    if (!track?.applyConstraints) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch {
      setHasTorch(false); // the device claimed torch but rejected it
    }
  }

  function submitManual() {
    const code = manual.trim();
    if (code.length < 4) return;
    onScan(code);
    setLastHit(code);
    setManual("");
    if (navigator.vibrate) navigator.vibrate(80);
  }

  const showCamera = !loadFailed && !error && ctor;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Scan with the camera</DialogTitle>
          <DialogDescription>Fit the barcode inside the box.</DialogDescription>
        </DialogHeader>

        {loadFailed && (
          <p className="text-muted-foreground text-sm">
            The barcode reader couldn&apos;t load — check the connection and
            reopen, or type the number below.
          </p>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {!showCamera && !loadFailed && !error && (
          <p className="text-muted-foreground text-sm">Starting the camera…</p>
        )}

        {showCamera && (
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
              {hasTorch && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 top-2"
                  onClick={toggleTorch}
                  aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
                >
                  {torchOn ? <FlashlightOff className="size-4" /> : <Flashlight className="size-4" />}
                </Button>
              )}
            </div>
            {lastHit && (
              <p className="text-center text-sm">
                Last scan:{" "}
                <span className="font-semibold tabular-nums">{lastHit}</span>
              </p>
            )}
          </>
        )}

        {/* Always available — a rep is never stuck on a tag that won't scan. */}
        <div className="flex gap-2">
          <Input
            inputMode="numeric"
            placeholder="Or type the barcode…"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitManual();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={submitManual}>
            Add
          </Button>
        </div>

        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
