-- Phase 12.1 website/network policy backend foundation.
-- No Android traffic interception or blocking is implemented by this migration.

CREATE TABLE network_policies (
  id UUID PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  CONSTRAINT network_policy_status_check CHECK (status IN ('ACTIVE','DISABLED')),
  CONSTRAINT network_policy_version_check CHECK (version > 0),
  CONSTRAINT network_policy_name_check CHECK (length(trim(name)) BETWEEN 1 AND 160),
  CONSTRAINT network_policy_description_check CHECK (description IS NULL OR length(description) <= 2000)
);
CREATE UNIQUE INDEX network_policy_admin_name_idx ON network_policies(admin_id, lower(name));
CREATE INDEX network_policy_admin_updated_idx ON network_policies(admin_id, updated_at DESC, id DESC);

CREATE TABLE network_policy_rules (
  id UUID PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES network_policies(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  action TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT network_policy_rule_action_check CHECK (action IN ('ALLOW','BLOCK')),
  CONSTRAINT network_policy_rule_enabled_check CHECK (enabled IN (TRUE,FALSE)),
  CONSTRAINT network_policy_rule_domain_check CHECK (
    domain ~ '^(\\*\\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    AND length(domain) <= 255
    AND position('..' in domain) = 0
  )
);
CREATE UNIQUE INDEX network_policy_rule_domain_idx ON network_policy_rules(policy_id, domain);
CREATE INDEX network_policy_rule_policy_idx ON network_policy_rules(policy_id, enabled);

CREATE TABLE network_policy_assignments (
  managed_device_id UUID PRIMARY KEY REFERENCES managed_devices(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES network_policies(id) ON DELETE RESTRICT,
  policy_version INTEGER NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  CONSTRAINT network_policy_assignment_version_check CHECK (policy_version > 0)
);
CREATE INDEX network_policy_assignment_policy_idx ON network_policy_assignments(policy_id, managed_device_id);

CREATE TABLE network_policy_sync_state (
  managed_device_id UUID PRIMARY KEY REFERENCES managed_devices(id) ON DELETE CASCADE,
  desired_policy_id UUID REFERENCES network_policies(id) ON DELETE RESTRICT,
  desired_policy_version INTEGER,
  reported_policy_id UUID REFERENCES network_policies(id) ON DELETE RESTRICT,
  reported_policy_version INTEGER,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  last_requested_at TIMESTAMPTZ,
  last_reported_at TIMESTAMPTZ,
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT network_sync_status_check CHECK (
    status IN ('UNKNOWN','PENDING','APPLIED','PARTIALLY_APPLIED','FAILED','UNSUPPORTED','STALE','REVOKED')
  ),
  CONSTRAINT network_sync_desired_version_check CHECK (desired_policy_version IS NULL OR desired_policy_version > 0),
  CONSTRAINT network_sync_reported_version_check CHECK (reported_policy_version IS NULL OR reported_policy_version > 0),
  CONSTRAINT network_sync_error_length_check CHECK (last_error_code IS NULL OR length(last_error_code) <= 128)
);
CREATE INDEX network_policy_sync_status_idx ON network_policy_sync_state(status, updated_at DESC);

CREATE TABLE network_policy_capabilities (
  managed_device_id UUID PRIMARY KEY REFERENCES managed_devices(id) ON DELETE CASCADE,
  supported BOOLEAN NOT NULL,
  mode TEXT NOT NULL,
  capability_version INTEGER,
  reported_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT network_capability_mode_check CHECK (mode IN ('UNKNOWN','UNSUPPORTED','SUPPORTED')),
  CONSTRAINT network_capability_version_check CHECK (capability_version IS NULL OR capability_version > 0)
);

CREATE TABLE network_policy_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  managed_device_id UUID REFERENCES managed_devices(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES network_policies(id) ON DELETE SET NULL,
  policy_version INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT network_event_type_check CHECK (event_type IN (
    'POLICY_CREATED','POLICY_UPDATED','POLICY_DISABLED','POLICY_ASSIGNED',
    'POLICY_REMOVED','POLICY_SYNC_REQUESTED','ENFORCEMENT_STATUS_CHANGED','CAPABILITY_CHANGED'
  )),
  CONSTRAINT network_event_metadata_check CHECK (jsonb_typeof(metadata)='object'),
  CONSTRAINT network_event_policy_version_check CHECK (policy_version IS NULL OR policy_version > 0)
);
CREATE INDEX network_policy_events_device_time_idx ON network_policy_events(managed_device_id, occurred_at DESC);
CREATE INDEX network_policy_events_policy_time_idx ON network_policy_events(policy_id, occurred_at DESC);
CREATE INDEX network_policy_events_admin_time_idx ON network_policy_events(admin_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION validate_network_policy_assignment()
RETURNS TRIGGER AS $network_assignment$
DECLARE
  device_admin UUID; enrollment_status TEXT; operational_status TEXT;
  policy_admin UUID; policy_status TEXT; policy_version INTEGER;
BEGIN
  SELECT admin_id,enrollment_status,operational_status INTO device_admin,enrollment_status,operational_status
  FROM managed_devices WHERE id=NEW.managed_device_id;
  SELECT admin_id,status,version INTO policy_admin,policy_status,policy_version
  FROM network_policies WHERE id=NEW.policy_id;
  IF device_admin IS NULL OR policy_admin IS NULL THEN
    RAISE EXCEPTION 'Network policy assignment references an unknown resource' USING ERRCODE='foreign_key_violation';
  END IF;
  IF device_admin <> policy_admin OR NEW.assigned_by <> device_admin THEN
    RAISE EXCEPTION 'Network policy assignment ownership mismatch' USING ERRCODE='insufficient_privilege';
  END IF;
  IF enrollment_status <> 'ACTIVE' OR operational_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Network policy assignment requires an active device' USING ERRCODE='check_violation';
  END IF;
  IF policy_status <> 'ACTIVE' OR NEW.policy_version <> policy_version THEN
    RAISE EXCEPTION 'Network policy assignment version or status is stale' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$network_assignment$ LANGUAGE plpgsql;

CREATE TRIGGER network_policy_assignment_validate
BEFORE INSERT OR UPDATE ON network_policy_assignments
FOR EACH ROW EXECUTE FUNCTION validate_network_policy_assignment();

CREATE OR REPLACE FUNCTION propagate_network_policy_change()
RETURNS TRIGGER AS $network_policy_change$
BEGIN
  IF OLD.version <> NEW.version OR OLD.status <> NEW.status THEN
    IF NEW.status='ACTIVE' THEN
      UPDATE network_policy_assignments SET policy_version=NEW.version,updated_at=NOW() WHERE policy_id=NEW.id;
    END IF;
    UPDATE network_policy_sync_state
      SET desired_policy_id=CASE WHEN NEW.status='ACTIVE' THEN NEW.id ELSE NULL END,
          desired_policy_version=CASE WHEN NEW.status='ACTIVE' THEN NEW.version ELSE NULL END,
          status='PENDING',updated_at=NOW()
      WHERE desired_policy_id=NEW.id
         OR managed_device_id IN (SELECT managed_device_id FROM network_policy_assignments WHERE policy_id=NEW.id);
  END IF;
  RETURN NEW;
END;
$network_policy_change$ LANGUAGE plpgsql;

CREATE TRIGGER network_policy_change_propagation
AFTER UPDATE OF version,status ON network_policies
FOR EACH ROW EXECUTE FUNCTION propagate_network_policy_change();

CREATE OR REPLACE FUNCTION validate_network_policy_sync_state()
RETURNS TRIGGER AS $network_sync$
DECLARE
  device_admin UUID; desired_admin UUID; desired_status TEXT; desired_version INTEGER;
  assignment_policy UUID; assignment_version INTEGER; reported_admin UUID;
BEGIN
  SELECT admin_id INTO device_admin FROM managed_devices WHERE id=NEW.managed_device_id;
  IF device_admin IS NULL THEN RAISE EXCEPTION 'Network synchronization references an unknown device' USING ERRCODE='foreign_key_violation'; END IF;

  IF NEW.desired_policy_id IS NULL THEN
    IF NEW.desired_policy_version IS NOT NULL THEN RAISE EXCEPTION 'Desired policy version requires a desired policy' USING ERRCODE='check_violation'; END IF;
  ELSE
    SELECT admin_id,status,version INTO desired_admin,desired_status,desired_version FROM network_policies WHERE id=NEW.desired_policy_id;
    IF desired_admin IS NULL OR desired_admin<>device_admin OR desired_status<>'ACTIVE' OR desired_version<>NEW.desired_policy_version
      THEN RAISE EXCEPTION 'Desired network policy is stale or unauthorized' USING ERRCODE='insufficient_privilege'; END IF;
    SELECT policy_id,policy_version INTO assignment_policy,assignment_version FROM network_policy_assignments WHERE managed_device_id=NEW.managed_device_id;
    IF assignment_policy IS NULL OR assignment_policy<>NEW.desired_policy_id OR assignment_version<>NEW.desired_policy_version
      THEN RAISE EXCEPTION 'Desired network policy does not match the device assignment' USING ERRCODE='check_violation'; END IF;
  END IF;

  IF NEW.reported_policy_id IS NULL THEN
    IF NEW.reported_policy_version IS NOT NULL THEN RAISE EXCEPTION 'Reported policy version requires a reported policy' USING ERRCODE='check_violation'; END IF;
  ELSE
    SELECT admin_id INTO reported_admin FROM network_policies WHERE id=NEW.reported_policy_id;
    IF reported_admin IS NULL OR reported_admin<>device_admin THEN RAISE EXCEPTION 'Reported network policy is unauthorized' USING ERRCODE='insufficient_privilege'; END IF;
    IF NEW.reported_policy_version IS NULL OR NEW.reported_policy_version<=0 THEN RAISE EXCEPTION 'Reported network policy version is invalid' USING ERRCODE='check_violation'; END IF;
    IF NEW.status='APPLIED' THEN
      SELECT policy_id,policy_version INTO assignment_policy,assignment_version FROM network_policy_assignments WHERE managed_device_id=NEW.managed_device_id;
      IF assignment_policy IS DISTINCT FROM NEW.reported_policy_id OR assignment_version IS DISTINCT FROM NEW.reported_policy_version
        THEN RAISE EXCEPTION 'APPLIED state does not match current network policy assignment' USING ERRCODE='check_violation'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$network_sync$ LANGUAGE plpgsql;

CREATE TRIGGER network_policy_sync_validate
BEFORE INSERT OR UPDATE ON network_policy_sync_state
FOR EACH ROW EXECUTE FUNCTION validate_network_policy_sync_state();

CREATE OR REPLACE FUNCTION validate_network_policy_capability()
RETURNS TRIGGER AS $network_cap$
BEGIN
  IF NEW.mode='SUPPORTED' AND NEW.supported=FALSE THEN
    RAISE EXCEPTION 'SUPPORTED mode requires supported=true' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$network_cap$ LANGUAGE plpgsql;

CREATE TRIGGER network_policy_capability_validate
BEFORE INSERT OR UPDATE ON network_policy_capabilities
FOR EACH ROW EXECUTE FUNCTION validate_network_policy_capability();

CREATE OR REPLACE FUNCTION validate_network_policy_command()
RETURNS TRIGGER AS $network_command$
DECLARE
  device_admin UUID; policy_admin UUID; policy_status TEXT; policy_version INTEGER;
  assignment_device UUID;
BEGIN
  IF NEW.type NOT IN ('SYNC_NETWORK_POLICY','REQUEST_NETWORK_POLICY_STATUS') THEN RETURN NEW; END IF;
  SELECT admin_id INTO device_admin FROM managed_devices WHERE id=NEW.managed_device_id;
  IF device_admin IS NULL OR device_admin<>NEW.admin_id THEN
    RAISE EXCEPTION 'Network command ownership mismatch' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NEW.type='REQUEST_NETWORK_POLICY_STATUS' THEN
    IF NEW.payload<>'{"schemaVersion":1}'::jsonb THEN RAISE EXCEPTION 'Invalid network policy status command payload' USING ERRCODE='check_violation'; END IF;
    IF NEW.idempotency_key IS NULL OR NEW.idempotency_key !~ '^network-policy-status:[0-9a-f-]{36}:[A-Za-z0-9._:-]{1,128}$' THEN
      RAISE EXCEPTION 'Invalid network policy status idempotency key' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.payload->>'policyId' IS NULL THEN
    IF NEW.payload->'policyVersion'<>'null'::jsonb THEN RAISE EXCEPTION 'Invalid network policy removal payload' USING ERRCODE='check_violation'; END IF;
  ELSE
    IF (NEW.payload->>'policyId') !~ '^[0-9a-fA-F-]{36}$' OR (NEW.payload->>'policyVersion')::integer<=0 THEN
      RAISE EXCEPTION 'Invalid network policy payload' USING ERRCODE='check_violation';
    END IF;
    SELECT admin_id,status,version INTO policy_admin,policy_status,policy_version
      FROM network_policies WHERE id=(NEW.payload->>'policyId')::uuid;
    IF policy_admin IS NULL OR policy_admin<>NEW.admin_id OR policy_status<>'ACTIVE'
      OR policy_version<>(NEW.payload->>'policyVersion')::integer THEN
      RAISE EXCEPTION 'Network policy command references stale or unauthorized policy' USING ERRCODE='insufficient_privilege';
    END IF;
    SELECT managed_device_id INTO assignment_device
      FROM network_policy_assignments
      WHERE managed_device_id=NEW.managed_device_id AND policy_id=(NEW.payload->>'policyId')::uuid;
    IF assignment_device IS NULL THEN RAISE EXCEPTION 'Network policy command does not match device assignment' USING ERRCODE='check_violation'; END IF;
  END IF;
  IF NEW.idempotency_key IS NULL OR NEW.idempotency_key !~ '^network-policy:[0-9a-f-]{36}:(none|[0-9]+):[A-Za-z0-9._:-]{1,128}$' THEN
    RAISE EXCEPTION 'Invalid network policy command idempotency key' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$network_command$ LANGUAGE plpgsql;

ALTER TABLE commands DROP CONSTRAINT commands_type_check;
ALTER TABLE commands ADD CONSTRAINT commands_type_check CHECK (
  type IN ('FUTURE_COMMAND','START_SCREEN_SHARE','STOP_SCREEN_SHARE','START_AUDIO_ACCESS','STOP_AUDIO_ACCESS',
           'SYNC_APPLICATION_POLICY','REQUEST_APPLICATION_INVENTORY','SYNC_NETWORK_POLICY','REQUEST_NETWORK_POLICY_STATUS')
);

CREATE TRIGGER network_policy_command_validate
BEFORE INSERT OR UPDATE ON commands
FOR EACH ROW EXECUTE FUNCTION validate_network_policy_command();

CREATE OR REPLACE FUNCTION invalidate_network_policy_on_revoke()
RETURNS TRIGGER AS $network_revoke$
BEGIN
  IF NEW.enrollment_status='REVOKED' OR NEW.operational_status='REVOKED' THEN
    UPDATE network_policy_sync_state SET status='REVOKED',updated_at=NOW() WHERE managed_device_id=NEW.id;
    UPDATE commands SET status='REJECTED',completed_at=COALESCE(completed_at,NOW()),failure_code='DEVICE_REVOKED'
      WHERE managed_device_id=NEW.id
        AND type IN ('SYNC_NETWORK_POLICY','REQUEST_NETWORK_POLICY_STATUS')
        AND status IN ('CREATED','QUEUED','DELIVERING','DELIVERED','ACKNOWLEDGED');
  END IF;
  RETURN NEW;
END;
$network_revoke$ LANGUAGE plpgsql;

CREATE TRIGGER managed_device_network_policy_revocation
AFTER UPDATE OF enrollment_status,operational_status ON managed_devices
FOR EACH ROW
WHEN (NEW.enrollment_status='REVOKED' OR NEW.operational_status='REVOKED')
EXECUTE FUNCTION invalidate_network_policy_on_revoke();

COMMENT ON TABLE network_policies IS 'Admin-owned desired website/network restriction policies. This table does not represent actual Android network enforcement.';
COMMENT ON TABLE network_policy_sync_state IS 'Desired, reported, and enforcement state for network policy. Command delivery is not enforcement success.';
COMMENT ON TABLE network_policy_capabilities IS 'Managed-device capability report for supported network-policy mechanisms. Backend does not assume universal Android support.';
