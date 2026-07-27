"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export type StoreRepOption = { id: string; name: string };

const ALL = "all";

/**
 * Kiosk "brought in by" filter — parity with the admin clients page. Routes to
 * /store/clients?rep=… and preserves the current search. A Select (not pills)
 * so the whole team fits without crowding the narrow kiosk column.
 */
export function StoreRepFilter({
  reps,
  selected,
  q,
}: {
  reps: StoreRepOption[];
  selected: string | null;
  q: string;
}) {
  const router = useRouter();

  const go = (value: string | null) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (value && value !== ALL) params.set("rep", value);
    const qs = params.toString();
    router.push(qs ? `/store/clients?${qs}` : "/store/clients");
  };

  const items: Record<string, string> = {
    [ALL]: "Everyone",
    ...Object.fromEntries(reps.map((r) => [r.id, r.name])),
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="store-rep-filter">Brought in by</Label>
      <Select
        items={items}
        value={selected ?? ALL}
        onValueChange={(v) => go(typeof v === "string" ? v : ALL)}
      >
        <SelectTrigger id="store-rep-filter" className="h-11 w-full">
          <SelectValue placeholder="Everyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Everyone</SelectItem>
          {reps.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
