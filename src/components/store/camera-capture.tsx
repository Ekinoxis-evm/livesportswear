"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const TARGET_WIDTH = 480;
const TARGET_BYTES = 25 * 1024;

async function toSmallJpeg(video: HTMLVideoElement): Promise<Blob | null> {
  const scale = Math.min(1, TARGET_WIDTH / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Step quality down until the file is kiosk-lightweight.
  for (const quality of [0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return null;
    if (blob.size <= TARGET_BYTES || quality === 0.4) return blob;
  }
  return null;
}

/**
 * Front-camera face capture for check-in/out evidence. The camera failing
 * must never block clocking in — onCapture(null) is the escape hatch and the
 * missing photo is itself visible in the day's records.
 */
export function CameraCapture({
  title,
  pending,
  onCapture,
  onCancel,
}: {
  title: string;
  pending: boolean;
  onCapture: (photo: Blob | null) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 } },
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
      } catch {
        if (!cancelled) setError("Camera unavailable — check Safari permissions.");
      }
    }
    if (!preview) startCamera();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [preview, stopStream]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const shoot = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const blob = await toSmallJpeg(video);
    if (!blob) {
      setError("Could not capture — try again.");
      return;
    }
    stopStream();
    setPreview({ blob, url: URL.createObjectURL(blob) });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{title}</p>

      {error ? (
        <div className="bg-muted flex flex-col items-center gap-3 rounded-xl p-6 text-center">
          <p className="text-muted-foreground text-sm">{error}</p>
          <Button disabled={pending} onClick={() => onCapture(null)}>
            Continue without photo
          </Button>
        </div>
      ) : preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.url}
            alt="Captured face"
            className="mx-auto w-full max-w-60 -scale-x-100 rounded-xl"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending}
              onClick={() => setPreview(null)}
            >
              <RefreshCcw className="mr-1.5 size-4" /> Retake
            </Button>
            <Button
              className="flex-1"
              disabled={pending}
              onClick={() => onCapture(preview.blob)}
            >
              Use photo
            </Button>
          </div>
        </>
      ) : (
        <>
          <video
            ref={videoRef}
            playsInline
            muted
            className="mx-auto w-full max-w-60 -scale-x-100 rounded-xl"
          />
          <Button size="lg" className="h-14" disabled={pending} onClick={shoot}>
            <Camera className="mr-2 size-5" /> Take photo
          </Button>
        </>
      )}

      <Button variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
