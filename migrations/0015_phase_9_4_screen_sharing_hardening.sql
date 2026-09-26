-- Phase 9.4 screen-sharing security, lifecycle and audit hardening.
--
-- The state-transition trigger is the database backstop for all writers,
-- including revocation/disconnect triggers. Session events are recorded here
-- so direct security-triggered transitions cannot bypass the audit trail.

CREATE OR REPLACE FUNCTION validate_screen_sharing_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status='REQUESTED' AND NEW.status IN ('AUTHORIZED','REJECTED','FAILED','EXPIRED'))
    OR (OLD.status='AUTHORIZED' AND NEW.status IN ('STARTING','STOPPING','EXPIRED','FAILED'))
    OR (OLD.status='STARTING' AND NEW.status IN ('ACTIVE','STOPPING','FAILED','EXPIRED'))
    OR (OLD.status='ACTIVE' AND NEW.status IN ('STOPPING','EXPIRED','FAILED'))
    OR (OLD.status='STOPPING' AND NEW.status IN ('STOPPED','FAILED','EXPIRED'))
  ) THEN
    RAISE EXCEPTION 'Invalid screen-sharing state transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('STOPPED','EXPIRED','FAILED','REJECTED')
     AND NEW.stopped_at IS NULL THEN
    NEW.stopped_at := COALESCE(NEW.stopped_at, NOW());
  END IF;

  NEW.last_activity_at := COALESCE(NEW.last_activity_at, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS screen_sharing_validate_transition
  ON screen_sharing_sessions;

CREATE TRIGGER screen_sharing_validate_transition
BEFORE UPDATE OF status ON screen_sharing_sessions
FOR EACH ROW
EXECUTE FUNCTION validate_screen_sharing_transition();

CREATE OR REPLACE FUNCTION record_screen_sharing_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO screen_sharing_session_events
      (id, screen_session_id, from_status, to_status, occurred_at, termination_reason)
    VALUES
      (md5(NEW.id::text || clock_timestamp()::text)::uuid, NEW.id, OLD.status, NEW.status, COALESCE(NEW.last_activity_at, NOW()), NEW.termination_reason);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS screen_sharing_transition_audit
  ON screen_sharing_sessions;

CREATE TRIGGER screen_sharing_transition_audit
AFTER UPDATE OF status ON screen_sharing_sessions
FOR EACH ROW
EXECUTE FUNCTION record_screen_sharing_transition();

-- Connection loss must end the session safely. EXPIRED is used rather than
-- STOPPED because STOPPED is reserved for the normal STOPPING -> STOPPED path.
CREATE OR REPLACE FUNCTION terminate_screen_sessions_for_device_connection()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.state IN ('DISCONNECTED','EXPIRED') THEN
    UPDATE screen_sharing_sessions
      SET status='EXPIRED',
          stopped_at=COALESCE(stopped_at, NOW()),
          last_activity_at=NOW(),
          termination_reason='DEVICE_DISCONNECTED',
          transport_state=jsonb_build_object('state','EXPIRED','reason','DEVICE_DISCONNECTED')
      WHERE managed_device_id=NEW.managed_device_id
        AND status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION terminate_screen_sessions_for_device_revocation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.enrollment_status = 'REVOKED' OR NEW.operational_status = 'REVOKED' THEN
    UPDATE screen_sharing_sessions
      SET status='EXPIRED',
          stopped_at=COALESCE(stopped_at, NOW()),
          last_activity_at=NOW(),
          termination_reason='DEVICE_REVOKED',
          transport_state=jsonb_build_object('state','EXPIRED','reason','DEVICE_REVOKED')
      WHERE managed_device_id=NEW.id
        AND status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION terminate_screen_sessions_for_admin_disable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'DISABLED' THEN
    UPDATE screen_sharing_sessions
      SET status='EXPIRED',
          stopped_at=COALESCE(stopped_at, NOW()),
          last_activity_at=NOW(),
          termination_reason='ADMIN_DISABLED',
          transport_state=jsonb_build_object('state','EXPIRED','reason','ADMIN_DISABLED')
      WHERE admin_id=NEW.id
        AND status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the existing triggers so the hardened functions are used.
DROP TRIGGER IF EXISTS device_connection_screen_session_termination
  ON device_connection_sessions;
CREATE TRIGGER device_connection_screen_session_termination
AFTER UPDATE OF state ON device_connection_sessions
FOR EACH ROW
WHEN (NEW.state IN ('DISCONNECTED','EXPIRED'))
EXECUTE FUNCTION terminate_screen_sessions_for_device_connection();

DROP TRIGGER IF EXISTS managed_device_screen_session_revocation
  ON managed_devices;
CREATE TRIGGER managed_device_screen_session_revocation
AFTER UPDATE OF enrollment_status, operational_status ON managed_devices
FOR EACH ROW
WHEN (NEW.enrollment_status = 'REVOKED' OR NEW.operational_status = 'REVOKED')
EXECUTE FUNCTION terminate_screen_sessions_for_device_revocation();

DROP TRIGGER IF EXISTS admin_screen_session_disable
  ON admins;
CREATE TRIGGER admin_screen_session_disable
AFTER UPDATE OF status ON admins
FOR EACH ROW
WHEN (NEW.status = 'DISABLED')
EXECUTE FUNCTION terminate_screen_sessions_for_admin_disable();

CREATE INDEX IF NOT EXISTS screen_sharing_expired_cleanup_idx
  ON screen_sharing_sessions (stopped_at, id)
  WHERE stopped_at IS NOT NULL;
