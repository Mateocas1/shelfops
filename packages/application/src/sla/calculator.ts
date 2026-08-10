import type { SlaCalendar } from "./calendar.js";

export type SlaRule = Readonly<{ policyVersionId: string; policyVersion: number; category: string; severity: string; clockMode: "continuous-utc"; pausesWhenBlocked: boolean; warningAfterSeconds: number; deadlineAfterSeconds: number }>;
export type SlaSchedule = Readonly<{ warningAt: Date; deadlineAt: Date }>;
export function calculateSlaSchedule(startedAt: Date, rule: SlaRule, calendar: SlaCalendar): SlaSchedule {
  return { warningAt: calendar.add(startedAt, rule.warningAfterSeconds), deadlineAt: calendar.add(startedAt, rule.deadlineAfterSeconds) };
}
