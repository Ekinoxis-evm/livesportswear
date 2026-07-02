"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

/**
 * QR a coworker scans with their phone camera to attest an entry/exit. Encodes
 * /portal/validate/{token}; the origin is resolved client-side so the same
 * build works on preview and production.
 */
export function ValidationQr({ token, caption }: { token: string; caption: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(`${window.location.origin}/portal/validate/${token}`);
  }, [token]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-4">
      {url ? (
        <QRCodeSVG value={url} size={168} marginSize={1} />
      ) : (
        <div className="size-42" />
      )}
      <p className="text-center text-xs font-medium text-zinc-600">{caption}</p>
    </div>
  );
}
