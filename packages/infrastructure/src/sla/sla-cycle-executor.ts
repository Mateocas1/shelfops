import { SlaRuleUnavailableError, startInitialSlaCycle, type SlaRule } from "@shelfops/application/sla/start-cycle";
import type { IdGenerator } from "@shelfops/application/ports/id-generator";
import type { SqlClient } from "../reference-data/postgres-configuration-repository.js";

type PolicyRule = { policy_version_id: string; policy_version: number; category_key: string; severity_key: string; clock_mode: "continuous-utc"; pauses_when_blocked: boolean; warning_after_seconds: number; deadline_after_seconds: number };
type ActiveCycle = { id: string; started_at: Date; active_segment_id: string; segment_sequence: number };
export type StartSlaCycleInput = Readonly<{ incidentId: string; organizationId: string; category: string; severity: string; startedAt: Date }>;
export type RecalculateSlaCycleInput = Readonly<{ incidentId: string; organizationId: string; category: string; severity: string; decidedAt: Date; actorUserId: string; correlationId: string }>;

async function appendEvent(client: SqlClient, id: string, incidentId: string, actorUserId: string, eventType: "sla-segment-recalculated" | "sla-warning" | "sla-breached", data: Record<string, unknown>): Promise<void> {
  const sequence = (await client.query<{ sequence: number }>("SELECT COALESCE(MAX(sequence),0)+1 sequence FROM incident_events WHERE incident_id=$1", [incidentId])).rows[0]!.sequence;
  await client.query("INSERT INTO incident_events(id,incident_id,sequence,event_type,actor_user_id,origin,data) VALUES($1,$2,$3,$4,$5,'system',$6::jsonb)", [id, incidentId, sequence, eventType, actorUserId, JSON.stringify(data)]);
}

export class PostgresSlaCycleExecutor {
  constructor(private readonly idGenerator: IdGenerator) {}
  private async rule(client: SqlClient, organizationId: string, category: string, severity: string): Promise<SlaRule> {
    const policy = (await client.query<PolicyRule>("SELECT p.id policy_version_id,p.version policy_version,r.category_key,r.severity_key,p.clock_mode,p.pauses_when_blocked,r.warning_after_seconds,r.deadline_after_seconds FROM sla_policy_versions p JOIN sla_policy_rules r ON r.policy_version_id=p.id AND r.organization_id=p.organization_id JOIN categories c ON c.key=r.category_key AND c.organization_id=p.organization_id AND c.active JOIN severities s ON s.key=r.severity_key AND s.organization_id=p.organization_id AND s.active WHERE p.organization_id=$1 AND p.active AND p.effective_at<=transaction_timestamp() AND r.category_key=$2 AND r.severity_key=$3 ORDER BY p.effective_at DESC,p.version DESC LIMIT 1", [organizationId, category, severity])).rows[0];
    if (!policy) throw new SlaRuleUnavailableError();
    return { policyVersionId: policy.policy_version_id, policyVersion: policy.policy_version, category: policy.category_key, severity: policy.severity_key, clockMode: policy.clock_mode, pausesWhenBlocked: policy.pauses_when_blocked, warningAfterSeconds: policy.warning_after_seconds, deadlineAfterSeconds: policy.deadline_after_seconds };
  }
  async start(client: SqlClient, input: StartSlaCycleInput): Promise<void> {
    const rule = await this.rule(client, input.organizationId, input.category, input.severity);
    const cycle = startInitialSlaCycle({ incidentId: input.incidentId, startedAt: input.startedAt, rule }); const snapshotId = this.idGenerator.next(), cycleId = this.idGenerator.next(), segmentId = this.idGenerator.next();
    await client.query("INSERT INTO incident_sla_rule_snapshots(id,incident_id,organization_id,policy_version_id,policy_version,category_key,severity_key,clock_mode,pauses_when_blocked,warning_after_seconds,deadline_after_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [snapshotId, input.incidentId, input.organizationId, rule.policyVersionId, rule.policyVersion, rule.category, rule.severity, rule.clockMode, rule.pausesWhenBlocked, rule.warningAfterSeconds, rule.deadlineAfterSeconds]);
    await client.query("INSERT INTO incident_sla_cycles(id,incident_id,snapshot_id,sequence,condition,started_at,warning_at,deadline_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [cycleId, cycle.incidentId, snapshotId, cycle.sequence, cycle.condition, cycle.startedAt, cycle.warningAt, cycle.deadlineAt]);
    await client.query("INSERT INTO incident_sla_segments(id,cycle_id,snapshot_id,sequence,started_at,warning_at,deadline_at,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [segmentId, cycleId, snapshotId, cycle.segmentSequence, cycle.startedAt, cycle.warningAt, cycle.deadlineAt, cycle.active]);
  }
  async recalculate(client: SqlClient, input: RecalculateSlaCycleInput): Promise<void> {
    const cycle = (await client.query<ActiveCycle>("SELECT cycle.id,cycle.started_at,segment.id active_segment_id,segment.sequence segment_sequence FROM incident_sla_cycles cycle JOIN incident_sla_segments segment ON segment.cycle_id=cycle.id AND segment.incident_id=cycle.incident_id AND segment.active WHERE cycle.incident_id=$1 ORDER BY cycle.sequence DESC LIMIT 1 FOR UPDATE", [input.incidentId])).rows[0];
    if (!cycle) return;
    const rule = await this.rule(client, input.organizationId, input.category, input.severity);
    const warningAt = new Date(cycle.started_at.getTime() + rule.warningAfterSeconds * 1_000), deadlineAt = new Date(cycle.started_at.getTime() + rule.deadlineAfterSeconds * 1_000);
    const condition = input.decidedAt >= deadlineAt ? "breached" : input.decidedAt >= warningAt ? "warning" : "on-track";
    const snapshotId = this.idGenerator.next(), segmentId = this.idGenerator.next();
    await client.query("INSERT INTO incident_sla_rule_snapshots(id,incident_id,organization_id,policy_version_id,policy_version,category_key,severity_key,clock_mode,pauses_when_blocked,warning_after_seconds,deadline_after_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [snapshotId, input.incidentId, input.organizationId, rule.policyVersionId, rule.policyVersion, rule.category, rule.severity, rule.clockMode, rule.pausesWhenBlocked, rule.warningAfterSeconds, rule.deadlineAfterSeconds]);
    await client.query("UPDATE incident_sla_segments SET active=false,ended_at=$2 WHERE id=$1 AND active", [cycle.active_segment_id, input.decidedAt]);
    await client.query("UPDATE incident_sla_cycles SET snapshot_id=$2,condition=$3,warning_at=$4,deadline_at=$5 WHERE id=$1", [cycle.id, snapshotId, condition, warningAt, deadlineAt]);
    await client.query("INSERT INTO incident_sla_segments(id,cycle_id,snapshot_id,incident_id,sequence,started_at,warning_at,deadline_at,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)", [segmentId, cycle.id, snapshotId, input.incidentId, cycle.segment_sequence + 1, input.decidedAt, warningAt, deadlineAt]);
    await appendEvent(client, this.idGenerator.next(), input.incidentId, input.actorUserId, "sla-segment-recalculated", { cycleId: cycle.id, priorSegmentId: cycle.active_segment_id, replacementSegmentId: segmentId, snapshotId, correlationId: input.correlationId });
    const recorded = async (eventType: "sla-warning" | "sla-breached") => (await client.query<{ recorded: boolean }>("SELECT EXISTS(SELECT 1 FROM incident_events WHERE incident_id=$1 AND event_type=$2 AND data->>'cycleId'=$3) recorded", [input.incidentId, eventType, cycle.id])).rows[0]!.recorded;
    if (input.decidedAt >= warningAt && !(await recorded("sla-warning"))) await appendEvent(client, this.idGenerator.next(), input.incidentId, input.actorUserId, "sla-warning", { cycleId: cycle.id, snapshotId, threshold: "warning", dueAt: warningAt.toISOString(), correlationId: input.correlationId });
    if (input.decidedAt >= deadlineAt && !(await recorded("sla-breached"))) await appendEvent(client, this.idGenerator.next(), input.incidentId, input.actorUserId, "sla-breached", { cycleId: cycle.id, snapshotId, threshold: "deadline", dueAt: deadlineAt.toISOString(), correlationId: input.correlationId });
  }
}
