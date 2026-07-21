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

export type RepOption = {
  id: string;
  name: string;
  clients: number;
  active: boolean;
};

const ALL = "all";

/**
 * Picks whose clients to show. A select rather than pills because the list
 * includes everyone who ever brought a client in — former staff included — and
 * that's far more names than a pill row can carry.
 */
export function ClientRepFilter({
  reps,
  selected,
  total,
}: {
  reps: RepOption[];
  selected: string | null;
  total: number;
}) {
  const router = useRouter();

  const go = (value: string | null) => {
    const params = new URLSearchParams();
    if (value && value !== ALL) params.set("rep", value);
    const qs = params.toString();
    router.push(qs ? `/admin/clients?${qs}` : "/admin/clients");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="rep-filter">Brought in by</Label>
      <Select
        value={selected ?? ALL}
        onValueChange={(v) => go(typeof v === "string" ? v : ALL)}
      >
        <SelectTrigger id="rep-filter" className="w-72">
          <SelectValue placeholder="Everyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>
            Everyone · {total.toLocaleString()} clients
          </SelectItem>
          {reps.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
              {r.active ? "" : " (former)"} · {r.clients.toLocaleString()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
