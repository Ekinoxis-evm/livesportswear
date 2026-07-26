import { requireAdmin } from "@/lib/auth";
import { listMessageTemplates } from "@/server/message-templates";
import { MessageManager } from "@/components/admin/message-manager";

export default async function ClientsMessagesPage() {
  await requireAdmin();
  const templates = await listMessageTemplates();
  const empty = { pt: "", en: "", es: "" };
  const initial =
    templates.ok && templates.data
      ? templates.data.templates
      : { thank_you: empty, hello: empty };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        The WhatsApp messages the kiosk sends clients, per language. Edit and save
        each; the store picks the message + language when sending.
      </p>
      <MessageManager initial={initial} />
    </div>
  );
}
