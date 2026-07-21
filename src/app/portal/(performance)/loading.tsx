import { Skeleton } from "@/components/ui/skeleton";

// Covers every Performance tab while its server render (and, on Sales/Clients,
// the Shopify reads) resolves — a wide Custom range can take a moment.
export default function PortalPerformanceLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-48" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}
