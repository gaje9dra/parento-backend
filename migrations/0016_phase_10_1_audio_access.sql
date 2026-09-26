-- Phase 10.1 authorized audio-access session foundation.
-- Control/signaling metadata only. No audio media or recordings are stored.

CREATE TABLE audio_access_sessions (
  id UUID PRIMARY KEY,
  managed_device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE RESTRICT,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  authorized_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  termination_reason TEXT,
  correlation_id TEXT NOT NULL,
  transport_state JSONB,
  CONSTRAINT audio_access_status_check CHECK (
    status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING','STOPPED','EXPIRED','FAILED','REJECTED')
  ),
  CONSTRAINT audio_access_termination_reason_check CHECK (
    termination_reason IS NULL OR termination_reason IN (
      'ADMIN_STOP','EXPIRED','DEVICE_DISCONNECTED','DEVICE_REVOKED',
      'ADMIN_DISABLED','FAILED','REJECTED','UNKNOWN'
    )
  ),
  CONSTRAINT audio_access_expiration_check CHECK (expires_at > created_at),
  CONSTRAINT audio_access_transport_object_check CHECK (
    transport_state IS NULL OR jsonb_typeof(transport_state) = 'object'
  )
);

CREATE INDEX audio_access_device_status_idx
  ON audio_access_sessions (managed_device_id, status, created_at DESC);
CREATE INDEX audio_access_admin_created_idx
  ON audio_access_sessions (admin_id, created_at DESC);
CREATE INDEX audio_access_expiry_idx
  ON audio_access_sessions (status, expires_at);
CREATE UNIQUE INDEX audio_access_one_active_device_idx
  ON audio_access_sessions (managed_device_id)
  WHERE status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING');

CREATE TABLE audio_access_session_events (
  id UUID PRIMARY KEY,
  audio_session_id UUID NOT NULL REFERENCES audio_access_sessions(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  termination_reason TEXT,
  CONSTRAINT audio_access_events_to_status_check CHECK (
    to_status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING','STOPPED','EXPIRED','FAILED','REJECTED')
  ),
  CONSTRAINT audio_access_events_reason_check CHECK (
    termination_reason IS NULL OR termination_reason IN (
      'ADMIN_STOP','EXPIRED','DEVICE_DISCONNECTED','DEVICE_REVOKED',
      'ADMIN_DISABLED','FAILED','REJECTED','UNKNOWN'
    )
  )
);

CREATE INDEX audio_access_events_session_time_idx
  ON audio_access_session_events (audio_session_id, occurred_at ASC, id ASC);

ALTER TABLE commands DROP CONSTRAINT commands_type_check;

ALTER TABLE commands
  ADD CONSTRAINT commands_type_check CHECK (
    type IN (
      'FUTURE_COMMAND',
      'START_SCREEN_SHARE',
      'STOP_SCREEN_SHARE',
      'START_AUDIO_ACCESS',
      'STOP_AUDIO_ACCESS'
    )
  );

CREATE OR REPLACE FUNCTION validate_audio_access_transition()
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
    RAISE EXCEPTION 'Invalid audio-access state transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('STOPPED','EXPIRED','FAILED','REJECTED')
     AND NEW.stopped_at IS NULL THEN
    NEW.stopped_at := NOW();
  END IF;

  NEW.last_activity_at := COALESCE(NEW.last_activity_at, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audio_access_validate_transition
BEFORE UPDATE OF status ON audio_access_sessions
FOR EACH ROW
EXECUTE FUNCTION validate_audio_access_transition();

CREATE OR REPLACE FUNCTION record_audio_access_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO audio_access_session_events
      (id, audio_session_id, from_status, to_status, occurred_at, termination_reason)
    VALUES
      (gen_random_uuid(), NEW.id, OLD.status, NEW.status,
       COALESCE(NEW.last_activity_at, NOW()), NEW.termination_reason);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audio_access_transition_audit
AFTER UPDATE OF status ON audio_access_sessions
FOR EACH ROW
EXECUTE FUNCTION record_audio_access_transition();

CREATE OR REPLACE FUNCTION terminate_audio_sessions_for_device_connection()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.state IN ('DISCONNECTED','EXPIRED') THEN
    UPDATE audio_access_sessions
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

CREATE TRIGGER device_connection_audio_session_termination
AFTER UPDATE OF state ON device_connection_sessions
FOR EACH ROW
WHEN (NEW.state IN ('DISCONNECTED','EXPIRED'))
EXECUTE FUNCTION terminate_audio_sessions_for_device_connection();

CREATE OR REPLACE FUNCTION terminate_audio_sessions_for_device_revocation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.enrollment_status = 'REVOKED' OR NEW.operational_status = 'REVOKED' THEN
    UPDATE audio_access_sessions
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

CREATE TRIGGER managed_device_audio_session_revocation
AFTER UPDATE OF enrollment_status, operational_status ON managed_devices
FOR EACH ROW
WHEN (NEW.enrollment_status = 'REVOKED' OR NEW.operational_status = 'REVOKED')
EXECUTE FUNCTION terminate_audio_sessions_for_device_revocation();

CREATE OR REPLACE FUNCTION terminate_audio_sessions_for_admin_disable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'DISABLED' THEN
    UPDATE audio_access_sessions
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

CREATE TRIGGER admin_audio_session_disable
AFTER UPDATE OF status ON admins
FOR EACH ROW
WHEN (NEW.status = 'DISABLED')
EXECUTE FUNCTION terminate_audio_sessions_for_admin_disable();

CREATE INDEX audio_access_expired_cleanup_idx
  ON audio_access_sessions (stopped_at, id)
  WHERE stopped_at IS NOT NULL;
