import { Skeleton } from "@/components/ui/skeleton";

// Shown instantly on every kiosk tab tap (covers /store and all children) while
// the next page's server render + Shopify reads resolve — no more frozen feel.
export default function StoreLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-56" />
      <Skeleton className="h-40" />
    </div>
  );
}
