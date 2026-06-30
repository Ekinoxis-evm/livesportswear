import { formatPct, type ConversionTotals } from "@/lib/conversion";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export type PersonRow = ConversionTotals & { name: string; isMe: boolean };

export function ConversionStats({
  store,
  mine,
  people,
}: {
  store: ConversionTotals;
  mine: ConversionTotals;
  people: PersonRow[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card grid grid-cols-3 gap-2 rounded-xl border p-4">
        <Metric label="Attended" value={String(store.attended)} />
        <Metric label="Sold" value={String(store.sold)} />
        <Metric label="Conversion" value={formatPct(store.conversion)} />
      </div>

      <div className="bg-card grid grid-cols-3 gap-2 rounded-xl border p-4">
        <Metric label="You · attended" value={String(mine.attended)} />
        <Metric label="You · sold" value={String(mine.sold)} />
        <Metric label="You · conv." value={formatPct(mine.conversion)} />
      </div>

      {people.length > 0 && (
        <div className="bg-card rounded-xl border p-4">
          <p className="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
            Team today
          </p>
          <ul className="flex flex-col divide-y">
            {people.map((p) => (
              <li
                key={p.name}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className={p.isMe ? "font-semibold" : ""}>
                  {p.name}
                  {p.isMe ? " (you)" : ""}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {p.sold}/{p.attended} · {formatPct(p.conversion)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
