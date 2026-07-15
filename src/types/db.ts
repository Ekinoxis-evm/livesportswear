import type { Database } from "@/lib/supabase/types";

export type { Database };

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];

export type Location = Tables<"locations">;
export type Employee = Tables<"employees">;
export type ShiftTemplate = Tables<"shift_templates">;
export type Schedule = Tables<"schedules">;
export type FloorBreak = Tables<"floor_breaks">;
export type Shift = Tables<"shifts">;
export type TimeOffRequest = Tables<"time_off_requests">;
export type AuditLog = Tables<"audit_log">;
export type ClientEvent = Tables<"client_events">;
export type StoreDayClose = Tables<"store_day_closes">;
export type StoreGoal = Tables<"store_goals">;
export type SalesContest = Tables<"sales_contests">;
export type AdminLocation = Tables<"admin_locations">;
export type FloorCheckin = Tables<"floor_checkins">;
export type FloorDay = Tables<"floor_days">;

export type EmployeeRole = Enums<"employee_role">;
export type ScheduleStatus = Enums<"schedule_status">;
export type TimeOffStatus = Enums<"time_off_status">;
