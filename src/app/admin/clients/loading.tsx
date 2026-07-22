import { Skeleton } from "@/components/ui/skeleton";

// This page waits on Shopify to hydrate the visible clients. Without a skeleton
// it renders nothing at all while that resolves, which on an iPad reads as the
// page being broken rather than loading.
export default function ClientsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16" />
      <Skeleton className="h-28" />
      <div className="flex gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-10 flex-1" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
