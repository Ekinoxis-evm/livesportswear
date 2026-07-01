"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScheduleGrid } from "@/components/schedule/schedule-grid";
import { ScheduleBoard } from "@/components/schedule/schedule-board";

type Shift = {
  id: string;
  employee_id: string;
  date: string;
  shift_template_id: string | null;
  start_time: string;
  end_time: string;
  notes: string | null;
};
type Template = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string | null;
  default_headcount: number;
};
type Employee = {
  id: string;
  name: string;
  role: string;
  avatar_color: string | null;
};
type DayOff = {
  id: string;
  employee_id: string;
  date: string;
  status: "approved" | "pending";
};

export function ScheduleWorkspace(props: {
  scheduleId: string | null;
  locationId: string;
  weekStart: string;
  days: string[];
  employees: Employee[];
  templates: Template[];
  shifts: Shift[];
  hoursByEmployee: Record<string, number>;
  daysOff: DayOff[];
}) {
  const { hoursByEmployee, ...common } = props;
  return (
    <Tabs defaultValue="board" className="gap-3">
      <TabsList>
        <TabsTrigger value="board">By shift</TabsTrigger>
        <TabsTrigger value="person">By person</TabsTrigger>
      </TabsList>
      <TabsContent value="board">
        <ScheduleBoard {...common} />
      </TabsContent>
      <TabsContent value="person">
        <ScheduleGrid {...common} hoursByEmployee={hoursByEmployee} />
      </TabsContent>
    </Tabs>
  );
}
