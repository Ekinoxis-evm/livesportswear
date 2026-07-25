import { Mail, MessageCircle } from "lucide-react";
import { mailtoLink, whatsappLink } from "@/lib/contact-links";
import { cn } from "@/lib/utils";

/**
 * WhatsApp + email for one client. A channel the client can't be reached on
 * renders as a disabled chip saying why, rather than a live button that opens
 * an empty draft — about a quarter of clients have no phone and nearly half no
 * email, so this state is normal and shouldn't read as broken.
 *
 * Contact details are rendered here but must never be logged (security.md).
 */
export function ContactButtons({
  phone,
  email,
  size = "default",
  className,
}: {
  phone: string | null | undefined;
  email: string | null | undefined;
  size?: "default" | "sm";
  className?: string;
}) {
  const wa = whatsappLink(phone);
  const mail = mailtoLink(email);
  const base = cn(
    "inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors",
    size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
  );
  const dead = "text-muted-foreground/70 border-dashed cursor-default";
  const icon = size === "sm" ? "size-3.5" : "size-4";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(base, "border-emerald-600/30 text-emerald-700 hover:bg-emerald-600/10 dark:text-emerald-500")}
        >
          <MessageCircle className={icon} />
          WhatsApp
        </a>
      ) : (
        <span className={cn(base, dead)} title="No usable phone number on file">
          <MessageCircle className={icon} />
          {phone ? "No country code" : "No phone"}
        </span>
      )}

      {mail ? (
        <a href={mail} className={cn(base, "hover:bg-muted")}>
          <Mail className={icon} />
          Email
        </a>
      ) : (
        <span className={cn(base, dead)} title="No email address on file">
          <Mail className={icon} />
          No email
        </span>
      )}
    </div>
  );
}
