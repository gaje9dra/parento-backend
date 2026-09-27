-- Phase 11.4 application-management security, concurrency, and lifecycle hardening.
-- This migration keeps the Phase 11.1 API surface unchanged.

-- A disabled policy may retain its historical assignment, but the assignment
-- version must not be rewritten while the policy is disabled. Re-enabling
-- the policy advances the assignment to the current policy version.
CREATE OR REPLACE FUNCTION propagate_application_policy_change()
RETURNS TRIGGER AS $app_policy_change$
BEGIN
  IF OLD.version <> NEW.version OR OLD.status <> NEW.status THEN
    IF NEW.status = 'ACTIVE' THEN
      UPDATE application_policy_assignments
        SET policy_version = NEW.version, updated_at = NOW()
        WHERE policy_id = NEW.id;
    END IF;

    UPDATE application_policy_sync_state
      SET desired_policy_version =
            CASE WHEN NEW.status = 'ACTIVE' THEN NEW.version ELSE NULL END,
          desired_policy_id =
            CASE WHEN NEW.status = 'ACTIVE' THEN NEW.id ELSE NULL END,
          status = 'PENDING',
          updated_at = NOW()
      WHERE desired_policy_id = NEW.id
         OR managed_device_id IN (
           SELECT managed_device_id
           FROM application_policy_assignments
           WHERE policy_id = NEW.id
         );
  END IF;
  RETURN NEW;
END;
$app_policy_change$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS application_policy_change_propagation
  ON application_policies;

CREATE TRIGGER application_policy_change_propagation
AFTER UPDATE OF version, status ON application_policies
FOR EACH ROW EXECUTE FUNCTION propagate_application_policy_change();

-- Strengthen assignment invariants at the database boundary, including
-- enrollment/operational lifecycle and cross-tenant ownership.
CREATE OR REPLACE FUNCTION validate_application_policy_assignment()
RETURNS TRIGGER AS $app_assignment$
DECLARE
  device_admin UUID;
  device_enrollment_status TEXT;
  device_operational_status TEXT;
  policy_admin UUID;
  policy_status TEXT;
  policy_version INTEGER;
BEGIN
  SELECT admin_id, enrollment_status, operational_status
    INTO device_admin, device_enrollment_status, device_operational_status
    FROM managed_devices
    WHERE id=NEW.managed_device_id;

  SELECT admin_id, status, version
    INTO policy_admin, policy_status, policy_version
    FROM application_policies
    WHERE id=NEW.policy_id;

  IF device_admin IS NULL OR policy_admin IS NULL THEN
    RAISE EXCEPTION 'Application policy assignment references an unknown resource'
      USING ERRCODE='foreign_key_violation';
  END IF;

  IF device_admin <> policy_admin OR NEW.assigned_by <> device_admin THEN
    RAISE EXCEPTION 'Application policy assignment ownership mismatch'
      USING ERRCODE='insufficient_privilege';
  END IF;

  IF device_enrollment_status <> 'ACTIVE'
     OR device_operational_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Application policy assignment requires an active device'
      USING ERRCODE='check_violation';
  END IF;

  IF policy_status <> 'ACTIVE' OR NEW.policy_version <> policy_version THEN
    RAISE EXCEPTION 'Application policy assignment version or status is stale'
      USING ERRCODE='check_violation';
  END IF;

  RETURN NEW;
END;
$app_assignment$ LANGUAGE plpgsql;

-- Synchronization state is a backend-owned state machine. Its policy
-- identities must stay in the same tenant as the device, and APPLIED may
-- only describe the device's current assignment.
CREATE OR REPLACE FUNCTION validate_application_policy_sync_state()
RETURNS TRIGGER AS $app_sync$
DECLARE
  device_admin UUID;
  desired_admin UUID;
  desired_status TEXT;
  desired_version INTEGER;
  assignment_policy UUID;
  assignment_version INTEGER;
  reported_admin UUID;
BEGIN
  SELECT admin_id INTO device_admin
    FROM managed_devices
    WHERE id=NEW.managed_device_id;

  IF device_admin IS NULL THEN
    RAISE EXCEPTION 'Application synchronization references an unknown device'
      USING ERRCODE='foreign_key_violation';
  END IF;

  IF NEW.desired_policy_id IS NULL THEN
    IF NEW.desired_policy_version IS NOT NULL THEN
      RAISE EXCEPTION 'Desired policy version requires a desired policy'
        USING ERRCODE='check_violation';
    END IF;
  ELSE
    SELECT admin_id, status, version
      INTO desired_admin, desired_status, desired_version
      FROM application_policies
      WHERE id=NEW.desired_policy_id;

    IF desired_admin IS NULL OR desired_admin <> device_admin
       OR desired_status <> 'ACTIVE'
       OR desired_version <> NEW.desired_policy_version THEN
      RAISE EXCEPTION 'Desired application policy is stale or unauthorized'
        USING ERRCODE='insufficient_privilege';
    END IF;

    SELECT policy_id, policy_version
      INTO assignment_policy, assignment_version
      FROM application_policy_assignments
      WHERE managed_device_id=NEW.managed_device_id;

    IF assignment_policy IS NULL
       OR assignment_policy <> NEW.desired_policy_id
       OR assignment_version <> NEW.desired_policy_version THEN
      RAISE EXCEPTION 'Desired application policy does not match the device assignment'
        USING ERRCODE='check_violation';
    END IF;
  END IF;

  IF NEW.reported_policy_id IS NULL THEN
    IF NEW.reported_policy_version IS NOT NULL THEN
      RAISE EXCEPTION 'Reported policy version requires a reported policy'
        USING ERRCODE='check_violation';
    END IF;
  ELSE
    SELECT admin_id INTO reported_admin
      FROM application_policies
      WHERE id=NEW.reported_policy_id;

    IF reported_admin IS NULL OR reported_admin <> device_admin THEN
      RAISE EXCEPTION 'Reported application policy is unauthorized'
        USING ERRCODE='insufficient_privilege';
    END IF;

    IF NEW.reported_policy_version IS NULL OR NEW.reported_policy_version <= 0 THEN
      RAISE EXCEPTION 'Reported application policy version is invalid'
        USING ERRCODE='check_violation';
    END IF;

    IF NEW.status = 'APPLIED' THEN
      SELECT policy_id, policy_version
        INTO assignment_policy, assignment_version
        FROM application_policy_assignments
        WHERE managed_device_id=NEW.managed_device_id;

      IF assignment_policy IS DISTINCT FROM NEW.reported_policy_id
         OR assignment_version IS DISTINCT FROM NEW.reported_policy_version THEN
        RAISE EXCEPTION 'APPLIED state does not match the current device assignment'
          USING ERRCODE='check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$app_sync$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS application_policy_sync_state_validate
  ON application_policy_sync_state;

CREATE TRIGGER application_policy_sync_state_validate
BEFORE INSERT OR UPDATE ON application_policy_sync_state
FOR EACH ROW EXECUTE FUNCTION validate_application_policy_sync_state();

-- Inventory rows must never be written for a revoked/inactive device. The
-- application repository also re-checks the locked device row transactionally.
CREATE OR REPLACE FUNCTION validate_application_inventory_device()
RETURNS TRIGGER AS $app_inventory$
DECLARE
  enrollment_status TEXT;
  operational_status TEXT;
BEGIN
  SELECT enrollment_status, operational_status
    INTO enrollment_status, operational_status
    FROM managed_devices
    WHERE id=NEW.managed_device_id;

  IF enrollment_status <> 'ACTIVE' OR operational_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Application inventory requires an active device'
      USING ERRCODE='insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$app_inventory$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS application_inventory_device_validate
  ON application_inventory;

CREATE TRIGGER application_inventory_device_validate
BEFORE INSERT OR UPDATE ON application_inventory
FOR EACH ROW EXECUTE FUNCTION validate_application_inventory_device();

-- Replaying an older report must not replace a newer reported state.
-- The application repository additionally locks the state row and performs
-- this timestamp check atomically.
CREATE OR REPLACE FUNCTION validate_application_sync_timestamps()
RETURNS TRIGGER AS $app_sync_time$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.last_reported_at IS NOT NULL
     AND NEW.last_reported_at IS NOT NULL
     AND NEW.last_reported_at < OLD.last_reported_at THEN
    RAISE EXCEPTION 'Application synchronization report is older than the stored report'
      USING ERRCODE='serialization_failure';
  END IF;
  RETURN NEW;
END;
$app_sync_time$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS application_policy_sync_timestamp_validate
  ON application_policy_sync_state;

CREATE TRIGGER application_policy_sync_timestamp_validate
BEFORE UPDATE ON application_policy_sync_state
FOR EACH ROW EXECUTE FUNCTION validate_application_sync_timestamps();
