/**
 * Pay-period configuration. Sprints are 2 weeks (Mon–Sun ×2); payday is the
 * Friday after a sprint ends. Overridable via env so the cycle can shift without
 * a code change. The anchor MUST be a Monday.
 */
export const SPRINT_ANCHOR_MONDAY =
  process.env.SPRINT_ANCHOR_MONDAY ?? "2026-06-22";

export const BIWEEKLY_HOUR_CAP = Number(process.env.BIWEEKLY_HOUR_CAP ?? 80);
