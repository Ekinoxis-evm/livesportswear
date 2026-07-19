import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/**
 * The employee avatar everywhere: the uploaded profile photo when one
 * exists (public `avatars` bucket URL), else initials on the employee's
 * color. Size via className (default size-9).
 */
export function EmployeeAvatar({
  name,
  color,
  url,
  className,
}: {
  name: string;
  color: string | null;
  url?: string | null;
  className?: string;
}) {
  if (url) {
    return (
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold text-white",
        className,
      )}
      style={{ backgroundColor: color ?? "#9ca3af" }}
    >
      {initials(name)}
    </span>
  );
}
