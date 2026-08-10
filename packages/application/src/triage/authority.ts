type TriageField = "category" | "severity" | "assignee";
type TriageState = "open" | "classified";
type TriageEvaluation = Readonly<{ id: string; incidentId: string; incidentVersion: number }>;
type TriageDecision = Readonly<{ id: string; field: TriageField }>;
type TriageDecisionSet<Decision extends TriageDecision> = Readonly<{
  id: string;
  evaluationId: string;
  sequence: number;
  complete: boolean;
  items: readonly Decision[];
}>;
type TriageProjection<Evaluation extends TriageEvaluation, Decision extends TriageDecision> = Readonly<{
  incidentId: string;
  state: TriageState;
  version: number;
  status: "awaiting-evaluation" | "awaiting-decision" | "complete";
  currentEvaluation: Evaluation | null;
  latestDecisions: Readonly<{ category: Decision | null; severity: Decision | null; assignee: Decision | null }>;
  complete: boolean;
}>;

export type TriageAuthority<Evaluation extends TriageEvaluation = TriageEvaluation, Decision extends TriageDecision = TriageDecision> = Readonly<{
  incidentId: string;
  state: TriageState;
  version: number;
  evaluations: readonly Evaluation[];
  decisionSets: readonly TriageDecisionSet<Decision>[];
}>;

export class TriageValidationError extends Error { constructor() { super("triage-validation"); } }
export class TriageForbiddenError extends Error { constructor() { super("triage-forbidden"); } }
export class TriageNotFoundError extends Error { constructor() { super("not-found"); } }
export class TriageStaleVersionError extends Error { constructor(readonly currentVersion: number) { super("stale-version"); } }
export class TriageInvalidTransitionError extends Error {
  constructor(readonly currentState: "classified" | "in-progress" | "blocked" | "resolved") { super("invalid-transition"); }
}
export class TriageIdempotencyConflictError extends Error { constructor() { super("idempotency-conflict"); } }

const fields = ["category", "severity", "assignee"] as const;

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function reduceTriageProjection<Evaluation extends TriageEvaluation, Decision extends TriageDecision>(authority: TriageAuthority<Evaluation, Decision>): TriageProjection<Evaluation, Decision> {
  const latestDecisions: Record<TriageField, Decision | null> = { category: null, severity: null, assignee: null };
  const currentEvaluation = [...authority.evaluations].sort((left, right) => right.incidentVersion - left.incidentVersion || compare(right.id, left.id))[0];

  if (currentEvaluation === undefined) {
    const complete = authority.state === "classified";
    return { incidentId: authority.incidentId, state: authority.state, version: authority.version, status: complete ? "complete" : "awaiting-evaluation", currentEvaluation: null, latestDecisions, complete };
  }

  const decisionSets = authority.decisionSets
    .filter((set) => set.evaluationId === currentEvaluation.id)
    .sort((left, right) => left.sequence - right.sequence || compare(left.id, right.id));
  for (const set of decisionSets) for (const item of [...set.items].sort((left, right) => compare(left.id, right.id))) latestDecisions[item.field] = item;

  const complete = decisionSets.some((set) => set.complete) && fields.every((field) => latestDecisions[field] !== null);
  return {
    incidentId: authority.incidentId,
    state: complete ? "classified" : "open",
    version: authority.version,
    status: complete ? "complete" : "awaiting-decision",
    currentEvaluation,
    latestDecisions,
    complete
  };
}
