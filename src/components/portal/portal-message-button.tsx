"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { portalMessageLink } from "@/server/clients";
import { Button } from "@/components/ui/button";
import { ClientMessageDialog, type MessageTarget } from "@/components/shared/client-message-dialog";

/**
 * Portal "Message" button — opens the shared hello/thank-you dialog for one of
 * the rep's own clients (the send is signed as that rep). Hidden when there's
 * no phone on file.
 */
export function PortalMessageButton({
  customerId,
  name,
  phone,
  size = "sm",
}: {
  customerId: string;
  name: string;
  phone: string | null;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState<MessageTarget | null>(null);
  if (!phone) return null;
  return (
    <>
      <Button
        size={size}
        variant="outline"
        onClick={() => setOpen({ customerId, name })}
        aria-label={`Message ${name}`}
      >
        <MessageCircle className="mr-1.5 size-4" /> Message
      </Button>
      <ClientMessageDialog client={open} onClose={() => setOpen(null)} getLink={portalMessageLink} />
    </>
  );
}
