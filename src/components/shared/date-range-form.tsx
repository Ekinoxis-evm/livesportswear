import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * URL-driven range picker: a plain GET form, so the page stays a server
 * component and ranges are shareable links — the same philosophy as the
 * performance page's searchParams filters.
 */
export function DateRangeForm({
  from,
  to,
  action,
  hidden,
}: {
  from: string;
  to: string;
  action: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="range-from">From</Label>
        <Input id="range-from" type="date" name="from" defaultValue={from} className="w-40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="range-to">To</Label>
        <Input id="range-to" type="date" name="to" defaultValue={to} className="w-40" />
      </div>
      <Button type="submit" variant="outline" size="sm">
        Show sales
      </Button>
    </form>
  );
}
