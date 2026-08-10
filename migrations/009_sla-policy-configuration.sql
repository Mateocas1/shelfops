DROP INDEX sla_policy_versions_one_active_idx;
ALTER TABLE sla_policy_versions ADD COLUMN configured_by_user_id uuid;
ALTER TABLE sla_policy_versions ADD CONSTRAINT sla_policy_versions_configured_by_organization_fk FOREIGN KEY (configured_by_user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT;
CREATE INDEX sla_policy_versions_effective_idx ON sla_policy_versions (organization_id, effective_at DESC, version DESC) WHERE active;
