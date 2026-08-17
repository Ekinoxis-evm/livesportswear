import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The LIVE! mark. One component so the three web placements (login, kiosk
 * header, admin/portal chrome) can't drift into three different sizes and
 * radii. The source tile is square — `round` crops it to a circle for the
 * places where it reads as an avatar.
 */
export function BrandMark({
  size = 40,
  round = true,
  className,
  priority = false,
}: {
  size?: number;
  round?: boolean;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/livelogo.png"
      alt="LIVE!"
      width={size}
      height={size}
      priority={priority}
      className={cn(
        "shrink-0 object-cover",
        round ? "rounded-full" : "rounded-lg",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
