import { describe, expect, it } from "vitest";

import { TriageInvalidTransitionError, TriageStaleVersionError, reduceTriageProjection, type TriageAuthority } from "./authority.js";

describe("triage authority", () => {
  it("reduces the current evaluation and accumulated latest decisions into the complete projection", () => {
    const authority: TriageAuthority = {
      incidentId: "incident-a",
      state: "open",
      version: 5,
      evaluations: [
        { id: "evaluation-old", incidentId: "incident-a", incidentVersion: 3 },
        { id: "evaluation-current", incidentId: "incident-a", incidentVersion: 4 }
      ],
      decisionSets: [
        { id: "set-one", evaluationId: "evaluation-current", sequence: 1, complete: false, items: [{ id: "category-earlier", field: "category" }, { id: "severity", field: "severity" }] },
        { id: "set-two", evaluationId: "evaluation-current", sequence: 2, complete: true, items: [{ id: "category-latest", field: "category" }, { id: "assignee", field: "assignee" }] }
      ]
    };

    expect(reduceTriageProjection(authority)).toEqual({
      incidentId: "incident-a",
      state: "classified",
      version: 5,
      status: "complete",
      currentEvaluation: { id: "evaluation-current", incidentId: "incident-a", incidentVersion: 4 },
      latestDecisions: {
        category: { id: "category-latest", field: "category" },
        severity: { id: "severity", field: "severity" },
        assignee: { id: "assignee", field: "assignee" }
      },
      complete: true
    });
  });

  it("preserves legacy projections without an evaluation", () => {
    const open: TriageAuthority = { incidentId: "legacy-open", state: "open", version: 2, evaluations: [], decisionSets: [] };
    const classified: TriageAuthority = { incidentId: "legacy-classified", state: "classified", version: 3, evaluations: [], decisionSets: [] };

    expect(reduceTriageProjection(open)).toEqual({
      incidentId: "legacy-open", state: "open", version: 2, status: "awaiting-evaluation", currentEvaluation: null,
      latestDecisions: { category: null, severity: null, assignee: null }, complete: false
    });
    expect(reduceTriageProjection(classified)).toEqual({
      incidentId: "legacy-classified", state: "classified", version: 3, status: "complete", currentEvaluation: null,
      latestDecisions: { category: null, severity: null, assignee: null }, complete: true
    });
  });

  it("keeps an incomplete aggregate awaiting a decision even when completion was requested", () => {
    const authority: TriageAuthority = {
      incidentId: "incident-b", state: "open", version: 6,
      evaluations: [{ id: "evaluation-current", incidentId: "incident-b", incidentVersion: 6 }],
      decisionSets: [{ id: "set-one", evaluationId: "evaluation-current", sequence: 1, complete: true, items: [{ id: "category", field: "category" }] }]
    };

    expect(reduceTriageProjection(authority)).toEqual({
      incidentId: "incident-b", state: "open", version: 6, status: "awaiting-decision",
      currentEvaluation: { id: "evaluation-current", incidentId: "incident-b", incidentVersion: 6 },
      latestDecisions: { category: { id: "category", field: "category" }, severity: null, assignee: null }, complete: false
    });
  });

  it("retains the exact triage conflict payloads", () => {
    const invalid = new TriageInvalidTransitionError("resolved");
    const stale = new TriageStaleVersionError(8);

    expect({ message: invalid.message, currentState: invalid.currentState }).toEqual({ message: "invalid-transition", currentState: "resolved" });
    expect({ message: stale.message, currentVersion: stale.currentVersion }).toEqual({ message: "stale-version", currentVersion: 8 });
  });
});
