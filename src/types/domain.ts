/** App-level domain types (not DB rows). */

export type ViolationLevel = "block" | "warn";

export type ViolationCode =
  | "OVERLAPPING_SHIFTS"
  | "ON_TIME_OFF"
  | "MAX_DAYS_EXCEEDED"
  | "BELOW_MIN_DAYS_OFF"
  | "BELOW_COVERAGE"
  | "ABOVE_HOUR_TARGET"
  | "PREFERRED_DAY_OFF_USED";

export type Violation = {
  level: ViolationLevel;
  code: ViolationCode;
  employeeId?: string;
  date?: string;
  templateId?: string;
  message: string;
};

/** Inputs to the rules engine — decoupled from DB row shapes but compatible. */
export type RuleEmployee = {
  id: string;
  name: string;
  weekly_hour_target: number;
  max_days_per_week: number;
  weekly_days_off: number;
  preferred_days_off: string[];
};

export type RuleShift = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  shift_template_id: string | null;
};

export type RuleTemplate = {
  id: string;
  name: string;
  default_headcount: number;
};

export type RuleTimeOff = {
  employee_id: string;
  start_date: string;
  end_date: string;
  status: string;
};

export type RuleSchedule = {
  week_start: string;
};

export type ValidateScheduleInput = {
  schedule: RuleSchedule;
  shifts: RuleShift[];
  employees: RuleEmployee[];
  timeOff: RuleTimeOff[];
  templates: RuleTemplate[];
};
