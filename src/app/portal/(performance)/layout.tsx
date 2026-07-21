import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { PortalPerformanceTabs } from "@/components/portal/performance-tabs";

export default async function PortalPerformanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { employee } = await requireEmployee();
  const supabase = await createServerClient();
  const { data: location } = await supabase
    .from("locations")
    .select("name")
    .eq("id", employee.location_id)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">Performance</h1>
        <p className="text-muted-foreground text-sm">
          {employee.name} · {location?.name ?? "Live Active Wear"}
        </p>
      </div>
      <PortalPerformanceTabs />
      {children}
    </div>
  );
}
