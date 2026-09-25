CREATE TABLE device_credentials (
  id UUID PRIMARY KEY,
  managed_device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE RESTRICT,
  credential_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  CONSTRAINT device_credentials_status_check CHECK (status IN ('ACTIVE', 'REVOKED')),
  CONSTRAINT device_credentials_revoked_check CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL) OR status = 'ACTIVE'
  )
);
CREATE INDEX device_credentials_device_idx ON device_credentials (managed_device_id);
CREATE INDEX device_credentials_status_idx ON device_credentials (status);

CREATE TABLE device_connection_sessions (
  id UUID PRIMARY KEY,
  managed_device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE RESTRICT,
  session_token_hash TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'CONNECTING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  connected_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT device_connection_sessions_state_check
    CHECK (state IN ('CONNECTING', 'CONNECTED', 'DISCONNECTED', 'STALE', 'EXPIRED')),
  CONSTRAINT device_connection_sessions_expiration_check CHECK (expires_at > created_at)
);
CREATE INDEX device_connection_sessions_device_state_idx
  ON device_connection_sessions (managed_device_id, state);
CREATE INDEX device_connection_sessions_expires_idx
  ON device_connection_sessions (state, expires_at);

CREATE TABLE commands (
  id UUID PRIMARY KEY,
  managed_device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE RESTRICT,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'CREATED',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  delivery_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failure_code TEXT,
  error_category TEXT,
  result_code TEXT,
  result_metadata JSONB,
  CONSTRAINT commands_type_check CHECK (type IN ('FUTURE_COMMAND')),
  CONSTRAINT commands_version_check CHECK (version > 0),
  CONSTRAINT commands_status_check CHECK (
    status IN ('CREATED', 'QUEUED', 'DELIVERING', 'DELIVERED', 'ACKNOWLEDGED',
               'RUNNING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REJECTED')
  ),
  CONSTRAINT commands_expiration_check CHECK (expires_at > created_at),
  CONSTRAINT commands_payload_object_check CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX commands_device_created_idx ON commands (managed_device_id, created_at DESC, id DESC);
CREATE INDEX commands_admin_created_idx ON commands (admin_id, created_at DESC, id DESC);
CREATE INDEX commands_status_expiry_idx ON commands (status, expires_at);
CREATE UNIQUE INDEX commands_idempotency_unique_idx
  ON commands (admin_id, managed_device_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE command_events (
  id UUID PRIMARY KEY,
  command_id UUID NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id UUID,
  correlation_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT command_events_actor_check CHECK (actor_type IN ('ADMIN', 'DEVICE', 'SYSTEM')),
  CONSTRAINT command_events_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX command_events_command_time_idx ON command_events (command_id, occurred_at ASC, id ASC);

CREATE OR REPLACE FUNCTION revoke_device_communication_state()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.enrollment_status = 'REVOKED' OR NEW.operational_status = 'REVOKED' THEN
    UPDATE device_credentials
      SET status = 'REVOKED', revoked_at = COALESCE(revoked_at, NOW())
      WHERE managed_device_id = NEW.id AND status = 'ACTIVE';
    UPDATE device_connection_sessions
      SET state = 'EXPIRED', disconnected_at = COALESCE(disconnected_at, NOW()), last_activity_at = NOW()
      WHERE managed_device_id = NEW.id
        AND state IN ('CONNECTING', 'CONNECTED', 'STALE');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER managed_device_communication_revocation
AFTER UPDATE OF enrollment_status, operational_status ON managed_devices
FOR EACH ROW
WHEN (NEW.enrollment_status = 'REVOKED' OR NEW.operational_status = 'REVOKED')
EXECUTE FUNCTION revoke_device_communication_state();
