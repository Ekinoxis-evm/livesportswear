import { PackageCheck, PackageOpen } from "lucide-react";
import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { ReceivingCount, type CountItem } from "@/components/store/receiving-count";
import { Card, CardContent } from "@/components/ui/card";

export default async function StoreReceivingPage() {
  const { locationId } = await requireStore();
  const service = createServiceClient();

  // The active arrival for this store — a restock session the admin has handed
  // off (counting) or that's already been marked ready.
  const { data: count } = await service
    .from("inventory_counts")
    .select("id, status")
    .eq("location_id", locationId)
    .eq("kind", "restock")
    .in("status", ["counting", "ready"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!count) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-14 text-center">
          <PackageOpen className="size-10 opacity-40" />
          <p className="text-lg font-semibold">No arrival to count right now</p>
          <p className="max-w-sm text-sm">
            When an admin uploads a new-stock delivery and sends it here, the list of
            references to count will show up on this screen.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (count.status === "ready") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <PackageCheck className="text-primary size-10" />
          <p className="text-lg font-semibold">Counted — waiting for the admin</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            This arrival is fully counted. The admin will review and push it into Shopify.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { data: items } = await service
    .from("inventory_count_items")
    .select("id, barcode, sku, product_title, variant_title, expected, doc_qty, qty, hs_code, verified, unknown")
    .eq("count_id", count.id);

  return <ReceivingCount countId={count.id} items={(items ?? []) as CountItem[]} />;
}
