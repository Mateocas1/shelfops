import { IncidentReferenceError } from "../incidents/create-incident.js";
import { continuousUtcCalendar } from "./calendar.js";
import { calculateSlaSchedule, type SlaRule } from "./calculator.js";

export type { SlaRule } from "./calculator.js";
export type InitialSlaCycle = Readonly<{ incidentId: string; sequence: 1; segmentSequence: 1; condition: "on-track"; active: true; startedAt: Date; warningAt: Date; deadlineAt: Date; rule: SlaRule }>;
export class SlaRuleUnavailableError extends IncidentReferenceError { constructor() { super(); this.message = "missing-sla-rule"; } }
export function startInitialSlaCycle(input: Readonly<{ incidentId: string; startedAt: Date; rule: SlaRule }>): InitialSlaCycle {
  return { incidentId: input.incidentId, sequence: 1, segmentSequence: 1, condition: "on-track", active: true, startedAt: input.startedAt, ...calculateSlaSchedule(input.startedAt, input.rule, continuousUtcCalendar), rule: input.rule };
}
