import { Img } from "@react-email/components";

/**
 * The LIVE! mark for email.
 *
 * Email cannot resolve a relative path, so this needs the deployed absolute URL
 * — and when `NEXT_PUBLIC_APP_URL` isn't set (local scripts, tests) it renders
 * nothing rather than a broken-image icon.
 *
 * It is deliberately paired with the text wordmark each template already has,
 * never a replacement for it: most clients block remote images by default, and
 * a header that collapses to an empty box reads as a spoofed email. With images
 * off the templates still say LIVE in the accent colour, exactly as before.
 */
export function BrandLogo({ size = 40 }: { size?: number }) {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return null;
  return (
    <Img
      src={`${base.replace(/\/$/, "")}/livelogo.png`}
      alt=""
      width={size}
      height={size}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${size}px`,
        display: "block",
        margin: "0 0 12px",
      }}
    />
  );
}
