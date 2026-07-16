import { PerformanceTabs } from "@/components/admin/performance-tabs";

export default function PerformanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The floor day, sales any way you slice them, and contest standings.
        </p>
      </div>
      <PerformanceTabs />
      {children}
    </div>
  );
}
