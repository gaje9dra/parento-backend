-- Phase 11.1 backend application inventory and desired-policy foundation.

ALTER TABLE commands DROP CONSTRAINT IF EXISTS commands_type_check;
ALTER TABLE commands ADD CONSTRAINT commands_type_check CHECK (type IN ('FUTURE_COMMAND','START_SCREEN_SHARE','STOP_SCREEN_SHARE','START_AUDIO_ACCESS','STOP_AUDIO_ACCESS','SYNC_APPLICATION_POLICY','REQUEST_APPLICATION_INVENTORY'));

-- This migration stores application metadata and desired state only; Android enforcement is external.

CREATE TABLE application_inventory (
  managed_device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  application_label TEXT,
  version_name TEXT,
  version_code BIGINT,
  install_state TEXT NOT NULL DEFAULT 'INSTALLED',
  enabled BOOLEAN,
  category TEXT,
  first_observed_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (managed_device_id, package_name),
  CONSTRAINT application_inventory_package_check CHECK (length(package_name) BETWEEN 1 AND 255),
  CONSTRAINT application_inventory_version_code_check CHECK (version_code IS NULL OR version_code >= 0),
  CONSTRAINT application_inventory_install_state_check CHECK (install_state IN ('INSTALLED','UNINSTALLED','UNKNOWN'))
);

CREATE INDEX application_inventory_device_observed_idx ON application_inventory (managed_device_id, last_observed_at DESC, package_name ASC);

CREATE TABLE application_inventory_sync_state (
  managed_device_id UUID PRIMARY KEY REFERENCES managed_devices(id) ON DELETE CASCADE,
  synchronization_id UUID,
  observed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  CONSTRAINT application_inventory_sync_time_check CHECK (observed_at IS NULL OR received_at IS NULL OR observed_at <= received_at)
);

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
  CONSTRAINT application_policies_status_check CHECK (status IN ('ACTIVE','DISABLED')),
  CONSTRAINT application_policies_version_check CHECK (version > 0),
  CONSTRAINT application_policies_name_check CHECK (length(name) BETWEEN 1 AND 120)
);

CREATE INDEX application_policies_admin_status_idx ON application_policies (admin_id, status, updated_at DESC);

CREATE TABLE application_policy_rules (
  id UUID PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES application_policies(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  action TEXT NOT NULL,
  CONSTRAINT application_policy_rules_action_check CHECK (action IN ('ALLOW','BLOCK')),
  CONSTRAINT application_policy_rules_package_check CHECK (length(package_name) BETWEEN 1 AND 255),
  UNIQUE (policy_id, package_name)
);

CREATE INDEX application_policy_rules_policy_idx ON application_policy_rules (policy_id, package_name);

CREATE TABLE device_application_policy_assignments (
  managed_device_id UUID PRIMARY KEY REFERENCES managed_devices(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES application_policies(id) ON DELETE RESTRICT,
  policy_version INTEGER NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  CONSTRAINT device_application_policy_assignment_version_check CHECK (policy_version > 0)
);

CREATE INDEX device_application_policy_assignments_policy_idx ON device_application_policy_assignments (policy_id, assigned_at DESC);

CREATE TABLE application_enforcement_state (
  managed_device_id UUID PRIMARY KEY REFERENCES managed_devices(id) ON DELETE CASCADE,
  desired_policy_id UUID REFERENCES application_policies(id) ON DELETE SET NULL,
  desired_policy_version INTEGER,
  reported_policy_id UUID REFERENCES application_policies(id) ON DELETE SET NULL,
  reported_policy_version INTEGER,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  synchronization_required BOOLEAN NOT NULL DEFAULT FALSE,
  synchronization_requested_at TIMESTAMPTZ,
  last_reported_at TIMESTAMPTZ,
  failure_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT application_enforcement_status_check CHECK (status IN ('UNKNOWN','PENDING','APPLIED','PARTIALLY_APPLIED','FAILED','STALE')),
  CONSTRAINT application_enforcement_desired_version_check CHECK (desired_policy_version IS NULL OR desired_policy_version > 0),
  CONSTRAINT application_enforcement_reported_version_check CHECK (reported_policy_version IS NULL OR reported_policy_version > 0)
);

CREATE INDEX application_enforcement_status_idx ON application_enforcement_state (status, updated_at DESC);

CREATE OR REPLACE FUNCTION sync_application_enforcement_on_assignment()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO application_enforcement_state
    (managed_device_id, desired_policy_id, desired_policy_version, status, synchronization_required, synchronization_requested_at, updated_at)
  VALUES
    (NEW.managed_device_id, NEW.policy_id, NEW.policy_version, 'PENDING', TRUE, NOW(), NOW())
  ON CONFLICT (managed_device_id) DO UPDATE SET
    desired_policy_id = EXCLUDED.desired_policy_id,
    desired_policy_version = EXCLUDED.desired_policy_version,
    status = CASE
      WHEN application_enforcement_state.reported_policy_id = EXCLUDED.desired_policy_id
       AND application_enforcement_state.reported_policy_version = EXCLUDED.desired_policy_version
      THEN 'APPLIED' ELSE 'PENDING' END,
    synchronization_required = NOT (
      application_enforcement_state.reported_policy_id = EXCLUDED.desired_policy_id
      AND application_enforcement_state.reported_policy_version = EXCLUDED.desired_policy_version
    ),
    synchronization_requested_at = NOW(),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER device_application_policy_assignment_sync
AFTER INSERT OR UPDATE OF policy_id, policy_version ON device_application_policy_assignments
FOR EACH ROW EXECUTE FUNCTION sync_application_enforcement_on_assignment();

CREATE OR REPLACE FUNCTION clear_application_enforcement_on_revocation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.enrollment_status = 'REVOKED' OR NEW.operational_status = 'REVOKED' THEN
    UPDATE application_enforcement_state
    SET status='STALE', synchronization_required=FALSE, updated_at=NOW()
    WHERE managed_device_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER managed_device_application_enforcement_revocation
AFTER UPDATE OF enrollment_status, operational_status ON managed_devices
FOR EACH ROW WHEN (NEW.enrollment_status='REVOKED' OR NEW.operational_status='REVOKED')
EXECUTE FUNCTION clear_application_enforcement_on_revocation();

CREATE OR REPLACE FUNCTION sync_application_enforcement_on_policy_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'ACTIVE' THEN
    UPDATE application_enforcement_state e
    SET desired_policy_id = NEW.id,
        desired_policy_version = NEW.version,
        status = CASE WHEN e.reported_policy_id = NEW.id AND e.reported_policy_version = NEW.version THEN 'APPLIED' ELSE 'PENDING' END,
        synchronization_required = NOT (e.reported_policy_id = NEW.id AND e.reported_policy_version = NEW.version),
        synchronization_requested_at = NOW(),
        updated_at = NOW()
    WHERE e.managed_device_id IN (
      SELECT managed_device_id FROM device_application_policy_assignments WHERE policy_id = NEW.id
    );
  ELSE
    UPDATE application_enforcement_state e
    SET status='STALE', synchronization_required=FALSE, updated_at=NOW()
    WHERE e.managed_device_id IN (
      SELECT managed_device_id FROM device_application_policy_assignments WHERE policy_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER application_policy_enforcement_sync
AFTER UPDATE OF status, version ON application_policies
FOR EACH ROW EXECUTE FUNCTION sync_application_enforcement_on_policy_change();

CREATE OR REPLACE FUNCTION clear_application_enforcement_on_assignment_removal()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE application_enforcement_state
  SET desired_policy_id=NULL,
      desired_policy_version=NULL,
      status='UNKNOWN',
      synchronization_required=FALSE,
      synchronization_requested_at=NULL,
      updated_at=NOW()
  WHERE managed_device_id=OLD.managed_device_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER device_application_policy_assignment_remove_sync
AFTER DELETE ON device_application_policy_assignments
FOR EACH ROW EXECUTE FUNCTION clear_application_enforcement_on_assignment_removal();
