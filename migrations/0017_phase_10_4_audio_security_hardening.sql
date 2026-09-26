-- Phase 10.4 audio security hardening.
-- Bind every live audio session to the exact device connection that authorized it,
-- enforce immutable ownership, reject stale lifecycle transitions, and bind audio
-- commands to the same Admin/device/session tuple.

-- Existing live sessions created before this hardening cannot be safely rebound to
-- an exact connection identity. Expire them before enforcing the new invariant.
UPDATE audio_access_sessions
SET status='EXPIRED',
    stopped_at=COALESCE(stopped_at, NOW()),
    last_activity_at=NOW(),
    termination_reason='FAILED',
    transport_state=jsonb_build_object('state','EXPIRED','reason','SECURITY_HARDENING')
WHERE status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING');

ALTER TABLE audio_access_sessions
  ADD COLUMN device_connection_session_id UUID
    REFERENCES device_connection_sessions(id) ON DELETE RESTRICT;

CREATE INDEX audio_access_connection_session_idx
  ON audio_access_sessions (device_connection_session_id);

ALTER TABLE audio_access_sessions
  ADD CONSTRAINT audio_access_live_binding_check
  CHECK (
    status IN ('STOPPED','EXPIRED','FAILED','REJECTED')
    OR device_connection_session_id IS NOT NULL
  );

CREATE OR REPLACE FUNCTION validate_audio_access_security()
RETURNS TRIGGER AS $$
DECLARE
  device_admin_id UUID;
  connection_device_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.managed_device_id <> OLD.managed_device_id
       OR NEW.admin_id <> OLD.admin_id
       OR NEW.device_connection_session_id IS DISTINCT FROM OLD.device_connection_session_id THEN
      RAISE EXCEPTION 'Audio-session ownership is immutable'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT admin_id INTO device_admin_id
  FROM managed_devices
  WHERE id = NEW.managed_device_id;

  IF device_admin_id IS NULL OR device_admin_id <> NEW.admin_id THEN
    RAISE EXCEPTION 'Audio-session Admin/device ownership mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status NOT IN ('STOPPED','EXPIRED','FAILED','REJECTED') THEN
    IF NEW.device_connection_session_id IS NULL THEN
      RAISE EXCEPTION 'Live audio session requires a device connection binding'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.expires_at <= NOW() THEN
      RAISE EXCEPTION 'Expired audio session cannot remain live'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM admins
      WHERE id = NEW.admin_id AND status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'Audio session Admin is not active'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM managed_devices
      WHERE id = NEW.managed_device_id
        AND enrollment_status = 'ACTIVE'
        AND operational_status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'Audio session device is not active'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT managed_device_id INTO connection_device_id
    FROM device_connection_sessions
    WHERE id = NEW.device_connection_session_id
      AND state = 'CONNECTED'
      AND expires_at > NOW();

    IF connection_device_id IS NULL
       OR connection_device_id <> NEW.managed_device_id THEN
      RAISE EXCEPTION 'Audio session device connection is not valid'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audio_access_security_guard
  ON audio_access_sessions;

CREATE TRIGGER audio_access_security_guard
BEFORE INSERT OR UPDATE ON audio_access_sessions
FOR EACH ROW
EXECUTE FUNCTION validate_audio_access_security();

CREATE OR REPLACE FUNCTION validate_audio_command_binding()
RETURNS TRIGGER AS $$
DECLARE
  session_device_id UUID;
  session_admin_id UUID;
  session_status TEXT;
  session_expires_at TIMESTAMPTZ;
BEGIN
  IF NEW.type NOT IN ('START_AUDIO_ACCESS','STOP_AUDIO_ACCESS') THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.payload) <> 'object'
     OR NOT (NEW.payload ? 'audioSessionId')
     OR jsonb_typeof(NEW.payload->'audioSessionId') <> 'string'
     OR (NEW.payload->>'audioSessionId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     OR NEW.payload <> jsonb_build_object('audioSessionId', NEW.payload->>'audioSessionId') THEN
    RAISE EXCEPTION 'Audio command payload is invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.idempotency_key IS DISTINCT FROM
       ('audio-session:' || (NEW.payload->>'audioSessionId') || ':' || NEW.type) THEN
    RAISE EXCEPTION 'Audio command idempotency binding is invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT managed_device_id, admin_id, status, expires_at
    INTO session_device_id, session_admin_id, session_status, session_expires_at
  FROM audio_access_sessions
  WHERE id = (NEW.payload->>'audioSessionId')::UUID;

  IF session_device_id IS NULL
     OR session_device_id <> NEW.managed_device_id
     OR session_admin_id <> NEW.admin_id THEN
    RAISE EXCEPTION 'Audio command is not bound to its session owner'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'START_AUDIO_ACCESS' AND session_status <> 'AUTHORIZED' THEN
      RAISE EXCEPTION 'Audio start command requires AUTHORIZED session'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.type = 'STOP_AUDIO_ACCESS' AND session_status <> 'STOPPING' THEN
      RAISE EXCEPTION 'Audio stop command requires STOPPING session'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status IN ('DELIVERING','DELIVERED','ACKNOWLEDGED','RUNNING') THEN
    IF session_expires_at <= NOW() THEN
      RAISE EXCEPTION 'Expired audio session cannot execute a command'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.type = 'START_AUDIO_ACCESS'
       AND session_status NOT IN ('STARTING','ACTIVE') THEN
      RAISE EXCEPTION 'Stale audio start command rejected'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.type = 'STOP_AUDIO_ACCESS'
       AND session_status NOT IN ('STOPPING','STOPPED') THEN
      RAISE EXCEPTION 'Stale audio stop command rejected'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audio_command_security_guard ON commands;

CREATE TRIGGER audio_command_security_guard
BEFORE INSERT OR UPDATE OF status ON commands
FOR EACH ROW
EXECUTE FUNCTION validate_audio_command_binding();

-- Transport state is control metadata only. Explicitly reject fields commonly
-- used for reusable credentials or media payloads at the database boundary.
CREATE OR REPLACE FUNCTION validate_audio_transport_metadata()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.transport_state IS NOT NULL
     AND (
       NEW.transport_state ?| ARRAY[
         'token','credential','secret','authorization','accessToken',
         'refreshToken','audio','media','bytes','payload'
       ]
     ) THEN
    RAISE EXCEPTION 'Reusable transport credentials or media data are not permitted'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audio_transport_metadata_guard
  ON audio_access_sessions;

CREATE TRIGGER audio_transport_metadata_guard
BEFORE INSERT OR UPDATE OF transport_state ON audio_access_sessions
FOR EACH ROW
EXECUTE FUNCTION validate_audio_transport_metadata();
