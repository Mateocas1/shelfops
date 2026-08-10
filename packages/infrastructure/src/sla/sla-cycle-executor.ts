import { SlaRuleUnavailableError, startInitialSlaCycle, type SlaRule } from "@shelfops/application/sla/start-cycle";
import type { IdGenerator } from "@shelfops/application/ports/id-generator";
import type { SqlClient } from "../reference-data/postgres-configuration-repository.js";

type PolicyRule = { policy_version_id: string; policy_version: number; category_key: string; severity_key: string; clock_mode: "continuous-utc"; pauses_when_blocked: boolean; warning_after_seconds: number; deadline_after_seconds: number };
export type StartSlaCycleInput = Readonly<{ incidentId: string; organizationId: string; category: string; severity: string; startedAt: Date }>;
export class PostgresSlaCycleExecutor {
  constructor(private readonly idGenerator: IdGenerator) {}
  async start(client: SqlClient, input: StartSlaCycleInput): Promise<void> {
    const policy = (await client.query<PolicyRule>("SELECT p.id policy_version_id,p.version policy_version,r.category_key,r.severity_key,p.clock_mode,p.pauses_when_blocked,r.warning_after_seconds,r.deadline_after_seconds FROM sla_policy_versions p JOIN sla_policy_rules r ON r.policy_version_id=p.id AND r.organization_id=p.organization_id JOIN categories c ON c.key=r.category_key AND c.organization_id=p.organization_id AND c.active JOIN severities s ON s.key=r.severity_key AND s.organization_id=p.organization_id AND s.active WHERE p.organization_id=$1 AND p.active AND p.effective_at<=transaction_timestamp() AND r.category_key=$2 AND r.severity_key=$3 ORDER BY p.effective_at DESC,p.version DESC LIMIT 1", [input.organizationId, input.category, input.severity])).rows[0];
    if (!policy) throw new SlaRuleUnavailableError();
    const rule: SlaRule = { policyVersionId: policy.policy_version_id, policyVersion: policy.policy_version, category: policy.category_key, severity: policy.severity_key, clockMode: policy.clock_mode, pausesWhenBlocked: policy.pauses_when_blocked, warningAfterSeconds: policy.warning_after_seconds, deadlineAfterSeconds: policy.deadline_after_seconds };
    const cycle = startInitialSlaCycle({ incidentId: input.incidentId, startedAt: input.startedAt, rule }); const snapshotId = this.idGenerator.next(), cycleId = this.idGenerator.next(), segmentId = this.idGenerator.next();
    await client.query("INSERT INTO incident_sla_rule_snapshots(id,incident_id,organization_id,policy_version_id,policy_version,category_key,severity_key,clock_mode,pauses_when_blocked,warning_after_seconds,deadline_after_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [snapshotId, input.incidentId, input.organizationId, rule.policyVersionId, rule.policyVersion, rule.category, rule.severity, rule.clockMode, rule.pausesWhenBlocked, rule.warningAfterSeconds, rule.deadlineAfterSeconds]);
    await client.query("INSERT INTO incident_sla_cycles(id,incident_id,snapshot_id,sequence,condition,started_at,warning_at,deadline_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [cycleId, cycle.incidentId, snapshotId, cycle.sequence, cycle.condition, cycle.startedAt, cycle.warningAt, cycle.deadlineAt]);
    await client.query("INSERT INTO incident_sla_segments(id,cycle_id,snapshot_id,sequence,started_at,warning_at,deadline_at,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [segmentId, cycleId, snapshotId, cycle.segmentSequence, cycle.startedAt, cycle.warningAt, cycle.deadlineAt, cycle.active]);
  }
}
