"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type DayCell = {
  date: string; // YYYY-MM-DD
  weekday: string; // Mon
  dayNum: string; // 29
  isToday: boolean;
  mine: { time: string; title: string; gcal: string }[];
  store: { name: string; time: string; isMe: boolean }[];
};

function DateChip({ d }: { d: DayCell }) {
  return (
    <div
      className={cn(
        "flex w-12 shrink-0 flex-col items-center rounded-lg py-1",
        d.isToday ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
      )}
    >
      <span className="text-[10px] font-medium uppercase">{d.weekday}</span>
      <span className="text-lg font-semibold leading-none tabular-nums">{d.dayNum}</span>
    </div>
  );
}

function Row({ children, d }: { children: React.ReactNode; d: DayCell }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <DateChip d={d} />
      <div className="flex min-h-12 flex-1 flex-col justify-center gap-1.5">
        {children}
      </div>
    </li>
  );
}

export function ScheduleView({
  days,
  weekLabel,
}: {
  days: DayCell[];
  weekLabel: string;
}) {
  return (
    <Tabs defaultValue="mine" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="mine">My week</TabsTrigger>
          <TabsTrigger value="store">Store</TabsTrigger>
        </TabsList>
        <span className="text-muted-foreground text-xs tabular-nums">{weekLabel}</span>
      </div>

      {/* Own schedule — calendar of the week */}
      <TabsContent value="mine">
        <ul className="flex flex-col divide-y">
          {days.map((d) => (
            <Row key={d.date} d={d}>
              {d.mine.length === 0 ? (
                <span className="text-muted-foreground/60 text-sm">Off</span>
              ) : (
                d.mine.map((s, i) => (
                  <div
                    key={i}
                    className="bg-primary/10 border-primary/20 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5"
                  >
                    <span className="text-sm">
                      <span className="font-medium">{s.title}</span>
                      <span className="text-muted-foreground"> · {s.time}</span>
                    </span>
                    <a
                      href={s.gcal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary shrink-0 text-xs underline"
                    >
                      + Google
                    </a>
                  </div>
                ))
              )}
            </Row>
          ))}
        </ul>
      </TabsContent>

      {/* Store schedule — who works each day */}
      <TabsContent value="store">
        <ul className="flex flex-col divide-y">
          {days.map((d) => (
            <Row key={d.date} d={d}>
              {d.store.length === 0 ? (
                <span className="text-muted-foreground/60 text-sm">—</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {d.store.map((e, i) => (
                    <span
                      key={i}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        e.isMe ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      {e.name} · {e.time}
                    </span>
                  ))}
                </div>
              )}
            </Row>
          ))}
        </ul>
      </TabsContent>
    </Tabs>
  );
}
