-- Phase 11.1 application management and blocking foundation.
-- Desired application-management state only. No Android enforcement is performed here.

CREATE TABLE application_inventory (
  managed_device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  label TEXT,
  version_name TEXT,
  version_code BIGINT,
  install_state TEXT NOT NULL DEFAULT 'INSTALLED',
  enabled BOOLEAN,
  first_observed_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL,
  last_received_at TIMESTAMPTZ NOT NULL,
  source_category TEXT,
  PRIMARY KEY (managed_device_id, package_name),
  CONSTRAINT application_inventory_package_check CHECK (
    package_name ~ '^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$'
    AND length(package_name) <= 255
  ),
  CONSTRAINT application_inventory_version_code_check CHECK (
    version_code IS NULL OR version_code >= 0
  ),
  CONSTRAINT application_inventory_install_state_check CHECK (
    install_state IN ('INSTALLED','UPDATED','UNINSTALLED','UNKNOWN')
  ),
  CONSTRAINT application_inventory_label_length_check CHECK (
    label IS NULL OR length(label) <= 512
  ),
  CONSTRAINT application_inventory_version_name_length_check CHECK (
    version_name IS NULL OR length(version_name) <= 128
  ),
  CONSTRAINT application_inventory_source_category_length_check CHECK (
    source_category IS NULL OR length(source_category) <= 128
  ),
  CONSTRAINT application_inventory_observation_order_check CHECK (
    last_observed_at >= first_observed_at
  )
);

CREATE INDEX application_inventory_device_observed_idx
  ON application_inventory (managed_device_id, last_observed_at DESC);
CREATE INDEX application_inventory_package_idx
  ON application_inventory (package_name);

CREATE TABLE application_policies (
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
  CONSTRAINT application_policy_status_check CHECK (status IN ('ACTIVE','DISABLED')),
  CONSTRAINT application_policy_version_check CHECK (version > 0),
  CONSTRAINT application_policy_name_check CHECK (length(trim(name)) BETWEEN 1 AND 160),
  CONSTRAINT application_policy_description_check CHECK (
    description IS NULL OR length(description) <= 2000
  )
);

CREATE UNIQUE INDEX application_policy_admin_name_idx
  ON application_policies (admin_id, lower(name));
CREATE INDEX application_policy_admin_updated_idx
  ON application_policies (admin_id, updated_at DESC, id DESC);

CREATE TABLE application_policy_rules (
  policy_id UUID NOT NULL REFERENCES application_policies(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  action TEXT NOT NULL,
  PRIMARY KEY (policy_id, package_name),
  CONSTRAINT application_policy_rule_package_check CHECK (
    package_name ~ '^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$'
    AND length(package_name) <= 255
  ),
  CONSTRAINT application_policy_rule_action_check CHECK (action IN ('ALLOW','BLOCK'))
);

CREATE TABLE application_policy_assignments (
  managed_device_id UUID PRIMARY KEY REFERENCES managed_devices(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES application_policies(id) ON DELETE RESTRICT,
  policy_version INTEGER NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  CONSTRAINT application_policy_assignment_version_check CHECK (policy_version > 0)
);

CREATE INDEX application_policy_assignment_policy_idx
  ON application_policy_assignments (policy_id, managed_device_id);

CREATE TABLE application_policy_sync_state (
  managed_device_id UUID PRIMARY KEY REFERENCES managed_devices(id) ON DELETE CASCADE,
  desired_policy_id UUID REFERENCES application_policies(id) ON DELETE RESTRICT,
  desired_policy_version INTEGER,
  reported_policy_id UUID REFERENCES application_policies(id) ON DELETE RESTRICT,
  reported_policy_version INTEGER,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  last_requested_at TIMESTAMPTZ,
  last_reported_at TIMESTAMPTZ,
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT application_sync_status_check CHECK (
    status IN ('UNKNOWN','PENDING','APPLIED','PARTIALLY_APPLIED','FAILED','STALE')
  ),
  CONSTRAINT application_sync_desired_version_check CHECK (
    desired_policy_version IS NULL OR desired_policy_version > 0
  ),
  CONSTRAINT application_sync_reported_version_check CHECK (
    reported_policy_version IS NULL OR reported_policy_version > 0
  ),
  CONSTRAINT application_sync_error_length_check CHECK (
    last_error_code IS NULL OR length(last_error_code) <= 128
  )
);

CREATE INDEX application_sync_status_idx
  ON application_policy_sync_state (status, updated_at DESC);

CREATE TABLE application_management_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  managed_device_id UUID REFERENCES managed_devices(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES application_policies(id) ON DELETE SET NULL,
  policy_version INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT application_event_type_check CHECK (
    event_type IN (
      'POLICY_CREATED','POLICY_UPDATED','POLICY_DISABLED',
      'POLICY_ASSIGNED','POLICY_REMOVED','INVENTORY_SYNCHRONIZED',
      'POLICY_SYNC_REQUESTED','ENFORCEMENT_STATUS_CHANGED'
    )
  ),
  CONSTRAINT application_event_metadata_check CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT application_event_policy_version_check CHECK (
    policy_version IS NULL OR policy_version > 0
  )
);

CREATE INDEX application_events_device_time_idx
  ON application_management_events (managed_device_id, occurred_at DESC);
CREATE INDEX application_events_policy_time_idx
  ON application_management_events (policy_id, occurred_at DESC);
CREATE INDEX application_events_admin_time_idx
  ON application_management_events (admin_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION validate_application_policy_assignment()
RETURNS TRIGGER AS $$
DECLARE
  device_admin UUID;
  policy_admin UUID;
  policy_status TEXT;
  policy_version INTEGER;
BEGIN
  SELECT admin_id INTO device_admin FROM managed_devices WHERE id=NEW.managed_device_id;
  SELECT admin_id, status, version
    INTO policy_admin, policy_status, policy_version
    FROM application_policies WHERE id=NEW.policy_id;

  IF device_admin IS NULL OR policy_admin IS NULL THEN
    RAISE EXCEPTION 'Application policy assignment references an unknown resource'
      USING ERRCODE='foreign_key_violation';
  END IF;

  IF device_admin <> policy_admin OR NEW.assigned_by <> device_admin THEN
    RAISE EXCEPTION 'Application policy assignment ownership mismatch'
      USING ERRCODE='insufficient_privilege';
  END IF;

  IF policy_status <> 'ACTIVE' OR NEW.policy_version <> policy_version THEN
    RAISE EXCEPTION 'Application policy assignment version or status is stale'
      USING ERRCODE='check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER application_policy_assignment_validate
BEFORE INSERT OR UPDATE ON application_policy_assignments
FOR EACH ROW EXECUTE FUNCTION validate_application_policy_assignment();

CREATE OR REPLACE FUNCTION propagate_application_policy_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.version <> NEW.version OR OLD.status <> NEW.status THEN
    UPDATE application_policy_assignments
      SET policy_version = NEW.version, updated_at = NOW()
      WHERE policy_id = NEW.id;

    UPDATE application_policy_sync_state
      SET desired_policy_version = CASE WHEN NEW.status='ACTIVE' THEN NEW.version ELSE NULL END,
          desired_policy_id = CASE WHEN NEW.status='ACTIVE' THEN NEW.id ELSE NULL END,
          status = 'PENDING',
          updated_at = NOW()
      WHERE desired_policy_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER application_policy_change_propagation
AFTER UPDATE OF version, status ON application_policies
FOR EACH ROW EXECUTE FUNCTION propagate_application_policy_change();

CREATE OR REPLACE FUNCTION invalidate_application_management_on_revoke()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.enrollment_status='REVOKED' OR NEW.operational_status='REVOKED' THEN
    UPDATE application_policy_sync_state
      SET status='STALE', updated_at=NOW()
      WHERE managed_device_id=NEW.id;

    UPDATE commands
      SET status='REJECTED',
          completed_at=COALESCE(completed_at,NOW()),
          failure_code='DEVICE_REVOKED'
      WHERE managed_device_id=NEW.id
        AND type IN ('SYNC_APPLICATION_POLICY','REQUEST_APPLICATION_INVENTORY')
        AND status IN ('CREATED','QUEUED','DELIVERING','DELIVERED','ACKNOWLEDGED');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER managed_device_application_management_revocation
AFTER UPDATE OF enrollment_status, operational_status ON managed_devices
FOR EACH ROW
WHEN (NEW.enrollment_status='REVOKED' OR NEW.operational_status='REVOKED')
EXECUTE FUNCTION invalidate_application_management_on_revoke();

COMMENT ON TABLE application_inventory IS
  'Current application metadata reported by a managed device. No APKs, private application data, credentials, or screenshots are stored.';
COMMENT ON TABLE application_policies IS
  'Admin-owned desired application-management policies. Version numbers represent the current desired policy version.';
COMMENT ON TABLE application_policy_sync_state IS
  'Desired versus reported application-policy synchronization boundary. It does not claim Android enforcement merely because a command was delivered.';

ALTER TABLE commands DROP CONSTRAINT commands_type_check;
ALTER TABLE commands
  ADD CONSTRAINT commands_type_check CHECK (
    type IN (
      'FUTURE_COMMAND',
      'START_SCREEN_SHARE',
      'STOP_SCREEN_SHARE',
      'START_AUDIO_ACCESS',
      'STOP_AUDIO_ACCESS',
      'SYNC_APPLICATION_POLICY',
      'REQUEST_APPLICATION_INVENTORY'
    )
  );

CREATE OR REPLACE FUNCTION validate_application_management_command()
RETURNS TRIGGER AS $$
DECLARE
  device_admin UUID;
  policy_admin UUID;
  policy_status TEXT;
  policy_version INTEGER;
  assignment_device UUID;
BEGIN
  IF NEW.type NOT IN ('SYNC_APPLICATION_POLICY','REQUEST_APPLICATION_INVENTORY') THEN
    RETURN NEW;
  END IF;

  SELECT admin_id INTO device_admin FROM managed_devices WHERE id=NEW.managed_device_id;
  IF device_admin IS NULL OR device_admin <> NEW.admin_id THEN
    RAISE EXCEPTION 'Application command ownership mismatch'
      USING ERRCODE='insufficient_privilege';
  END IF;

  IF NEW.type='REQUEST_APPLICATION_INVENTORY' THEN
    IF NEW.payload <> '{"schemaVersion":1}'::jsonb THEN
      RAISE EXCEPTION 'Invalid application inventory command payload'
        USING ERRCODE='check_violation';
    END IF;
    IF NEW.idempotency_key IS NULL OR NEW.idempotency_key !~ '^application-inventory:[0-9a-f-]{36}:[A-Za-z0-9._:-]{1,128}$' THEN
      RAISE EXCEPTION 'Invalid application inventory command idempotency key'
        USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF (SELECT count(*) FROM jsonb_object_keys(NEW.payload)) <> 2
     OR NOT (NEW.payload ? 'policyId')
     OR NOT (NEW.payload ? 'policyVersion') THEN
    RAISE EXCEPTION 'Invalid application policy command payload'
      USING ERRCODE='check_violation';
  END IF;

  IF NEW.payload->>'policyId' IS NULL THEN
    IF NEW.payload->'policyVersion' <> 'null'::jsonb THEN
      RAISE EXCEPTION 'Application policy removal payload is invalid'
        USING ERRCODE='check_violation';
    END IF;
  ELSE
    IF (NEW.payload->>'policyId') !~ '^[0-9a-fA-F-]{36}$'
       OR (NEW.payload->>'policyVersion')::integer <= 0 THEN
      RAISE EXCEPTION 'Application policy payload is invalid'
        USING ERRCODE='check_violation';
    END IF;

    SELECT admin_id, status, version
      INTO policy_admin, policy_status, policy_version
      FROM application_policies
      WHERE id=(NEW.payload->>'policyId')::uuid;

    IF policy_admin IS NULL OR policy_admin <> NEW.admin_id
       OR policy_status <> 'ACTIVE'
       OR policy_version <> (NEW.payload->>'policyVersion')::integer THEN
      RAISE EXCEPTION 'Application policy command references stale or unauthorized policy'
        USING ERRCODE='insufficient_privilege';
    END IF;

    SELECT managed_device_id INTO assignment_device
      FROM application_policy_assignments
      WHERE managed_device_id=NEW.managed_device_id
        AND policy_id=(NEW.payload->>'policyId')::uuid;

    IF assignment_device IS NULL THEN
      RAISE EXCEPTION 'Application policy command does not match the device assignment'
        USING ERRCODE='check_violation';
    END IF;
  END IF;

  IF NEW.idempotency_key IS NULL OR NEW.idempotency_key !~ '^application-policy:[0-9a-f-]{36}:(none|[0-9]+)$' THEN
    RAISE EXCEPTION 'Invalid application policy command idempotency key'
      USING ERRCODE='check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER application_management_command_validate
BEFORE INSERT OR UPDATE ON commands
FOR EACH ROW EXECUTE FUNCTION validate_application_management_command();
