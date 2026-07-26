import { ClientsTabs } from "@/components/admin/clients-tabs";

export default function ClientsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Shopify is the client book — the database, the messages you send them,
          and who brought each one in.
        </p>
      </div>
      <ClientsTabs />
      {children}
    </div>
  );
}
