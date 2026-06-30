"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export type MyShift = {
  date: string;
  weekday: string;
  label: string;
  gcal: string;
};
export type StoreDay = {
  date: string;
  weekday: string;
  entries: { name: string; time: string; isMe: boolean }[];
};

export function ScheduleView({
  mine,
  store,
}: {
  mine: MyShift[];
  store: StoreDay[];
}) {
  return (
    <Tabs defaultValue="mine">
      <TabsList>
        <TabsTrigger value="mine">My week</TabsTrigger>
        <TabsTrigger value="store">Store</TabsTrigger>
      </TabsList>

      <TabsContent value="mine">
        {mine.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            No published shifts for you yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {mine.map((s) => (
              <li
                key={s.date + s.label}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="flex flex-col">
                  <span className="tabular-nums">
                    {s.weekday} {s.date}
                  </span>
                  <span className="text-muted-foreground">{s.label}</span>
                </span>
                <a
                  href={s.gcal}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary shrink-0 text-xs underline"
                >
                  + Google
                </a>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="store">
        <ul className="flex flex-col divide-y">
          {store.map((d) => (
            <li key={d.date} className="flex flex-col gap-1 py-2 text-sm">
              <span className="text-muted-foreground text-xs tabular-nums">
                {d.weekday} {d.date}
              </span>
              {d.entries.length === 0 ? (
                <span className="text-muted-foreground/60 text-xs">—</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {d.entries.map((e, i) => (
                    <span
                      key={i}
                      className={
                        "rounded-full px-2 py-0.5 text-xs " +
                        (e.isMe ? "bg-primary text-primary-foreground" : "bg-muted")
                      }
                    >
                      {e.name} · {e.time}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </TabsContent>
    </Tabs>
  );
}
