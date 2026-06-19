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
export type Shift = Tables<"shifts">;
export type TimeOffRequest = Tables<"time_off_requests">;
export type AuditLog = Tables<"audit_log">;

export type EmployeeRole = Enums<"employee_role">;
export type ScheduleStatus = Enums<"schedule_status">;
export type TimeOffStatus = Enums<"time_off_status">;
