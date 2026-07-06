"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";

type ScanState = "starting" | "scanning" | "denied" | "unsupported";

/**
 * In-app camera scanner for attendance QRs. Decodes with jsQR (works on iOS
 * Safari, where BarcodeDetector doesn't exist) and only follows same-origin
 * /portal/validate/{token} links — anything else is ignored.
 */
export function QrScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>("starting");
  const [ignored, setIgnored] = useState(false);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    function tick() {
      const video = videoRef.current;
      if (done || !video || !ctx) return;
      if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, {
          inversionAttempts: "dontInvert",
        });
        if (code?.data) {
          try {
            const url = new URL(code.data, window.location.origin);
            if (
              url.origin === window.location.origin &&
              url.pathname.startsWith("/portal/validate/")
            ) {
              done = true;
              router.push(url.pathname);
              return;
            }
            setIgnored(true);
          } catch {
            setIgnored(true);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        video.play().catch(() => undefined);
        setState("scanning");
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setState("denied"));

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  if (state === "unsupported" || state === "denied") {
    return (
      <div className="bg-card rounded-2xl border p-6 text-center">
        <p className="font-semibold">
          {state === "denied" ? "Camera access was blocked" : "Camera not available"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {state === "denied"
            ? "Allow camera access for this site and reload, or scan the QR with your phone's camera app instead."
            : "Scan the QR with your phone's camera app instead — it opens the same confirmation page."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-full overflow-hidden rounded-2xl border">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
        <div className="border-primary/70 pointer-events-none absolute inset-8 rounded-xl border-2" />
      </div>
      <p className="text-muted-foreground text-sm">
        {state === "starting" ? "Starting camera…" : "Point at your coworker's QR code."}
      </p>
      {ignored && (
        <p className="text-sm text-amber-600">That's not a Live validation code.</p>
      )}
    </div>
  );
}
