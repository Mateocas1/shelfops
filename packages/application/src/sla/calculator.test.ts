import { describe, expect, it } from "vitest";
import { continuousUtcCalendar } from "./calendar.js";
import { calculateSlaSchedule, type SlaRule } from "./calculator.js";
import { startInitialSlaCycle } from "./start-cycle.js";

const medium: SlaRule = { policyVersionId: "policy-1", policyVersion: 1, category: "equipment-failure", severity: "medium", clockMode: "continuous-utc", pausesWhenBlocked: false, warningAfterSeconds: 57_600, deadlineAfterSeconds: 86_400 };

describe("initial SLA cycle", () => {
  it("calculates medium warning and deadline as continuous UTC instants", () => {
    expect(calculateSlaSchedule(new Date("2026-08-09T10:00:00.000Z"), medium, continuousUtcCalendar)).toEqual({ warningAt: new Date("2026-08-10T02:00:00.000Z"), deadlineAt: new Date("2026-08-10T10:00:00.000Z") });
  });

  it("starts a non-pausing critical cycle with an active first segment", () => {
    const cycle = startInitialSlaCycle({ incidentId: "incident-1", startedAt: new Date("2026-08-09T10:00:00.000Z"), rule: { ...medium, severity: "critical", warningAfterSeconds: 3_600, deadlineAfterSeconds: 7_200 } });
    expect(cycle).toMatchObject({ incidentId: "incident-1", sequence: 1, segmentSequence: 1, condition: "on-track", active: true, rule: { clockMode: "continuous-utc", pausesWhenBlocked: false, severity: "critical" } });
    expect(cycle.deadlineAt).toEqual(new Date("2026-08-09T12:00:00.000Z"));
  });
});
