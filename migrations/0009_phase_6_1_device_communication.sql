CREATE TABLE device_credentials (
  id UUID PRIMARY KEY,
  managed_device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE RESTRICT,
  credential_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT device_credentials_hash_check CHECK (credential_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT device_credentials_expiry_check CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE UNIQUE INDEX device_credentials_device_unique_idx ON device_credentials (managed_device_id);

CREATE TABLE device_sessions (
  id UUID PRIMARY KEY,
  managed_device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE RESTRICT,
  credential_id UUID NOT NULL REFERENCES device_credentials(id) ON DELETE RESTRICT,
  state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT device_sessions_state_check CHECK (state IN ('UNKNOWN','CONNECTING','CONNECTED','DISCONNECTED','STALE')),
  CONSTRAINT device_sessions_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX device_sessions_device_state_idx ON device_sessions (managed_device_id, state);
CREATE INDEX device_sessions_expires_idx ON device_sessions (expires_at);

CREATE TABLE device_commands (
  id UUID PRIMARY KEY,
  managed_device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE RESTRICT,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  command_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failure_code TEXT,
  correlation_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  session_id UUID REFERENCES device_sessions(id) ON DELETE SET NULL,
  CONSTRAINT device_commands_status_check CHECK (status IN ('CREATED','QUEUED','DELIVERING','DELIVERED','ACKNOWLEDGED','RUNNING','SUCCEEDED','FAILED','EXPIRED','CANCELLED','REJECTED')),
  CONSTRAINT device_commands_schema_version_check CHECK (schema_version > 0),
  CONSTRAINT device_commands_expiration_check CHECK (expires_at > created_at),
  CONSTRAINT device_commands_correlation_unique UNIQUE (correlation_id),
  CONSTRAINT device_commands_idempotency_format_check CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$')
);
CREATE UNIQUE INDEX device_commands_admin_idempotency_idx
  ON device_commands (admin_id, idempotency_key);
CREATE INDEX device_commands_device_created_idx
  ON device_commands (managed_device_id, created_at DESC, id DESC);
CREATE INDEX device_commands_admin_created_idx
  ON device_commands (admin_id, created_at DESC, id DESC);
CREATE INDEX device_commands_status_expires_idx
  ON device_commands (status, expires_at);
