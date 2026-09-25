CREATE TABLE device_credentials (
 id UUID PRIMARY KEY,
 managed_device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE RESTRICT,
 credential_hash TEXT NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ,
 revoked_at TIMESTAMPTZ,
 CONSTRAINT device_credentials_hash_check CHECK (credential_hash ~ '^[0-9a-f]{64}$'),
 CONSTRAINT device_credentials_expiry_check CHECK (expires_at IS NULL OR expires_at>created_at)
);
CREATE UNIQUE INDEX device_credentials_device_unique_idx ON device_credentials(managed_device_id);
CREATE TABLE device_sessions (
 id UUID PRIMARY KEY,
 managed_device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE RESTRICT,
 credential_id UUID NOT NULL REFERENCES device_credentials(id) ON DELETE RESTRICT,
 state TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_activity_at TIMESTAMPTZ NOT NULL,
 connected_at TIMESTAMPTZ NOT NULL,
 disconnected_at TIMESTAMPTZ,
 expires_at TIMESTAMPTZ NOT NULL,
 CONSTRAINT device_sessions_state_check CHECK(state IN ('UNKNOWN','CONNECTING','CONNECTED','DISCONNECTED','STALE')),
 CONSTRAINT device_sessions_expiry_check CHECK(expires_at>created_at)
);
CREATE INDEX device_sessions_device_state_idx ON device_sessions(managed_device_id,state);
CREATE INDEX device_sessions_expires_idx ON device_sessions(expires_at);
CREATE TABLE commands (
 id UUID PRIMARY KEY,
 managed_device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE RESTRICT,
 admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
 type TEXT NOT NULL,
 version INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'CREATED',
 payload JSONB NOT NULL,
 correlation_id UUID,
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
 CONSTRAINT commands_status_check CHECK(status IN ('CREATED','QUEUED','DELIVERING','DELIVERED','ACKNOWLEDGED','RUNNING','SUCCEEDED','FAILED','EXPIRED','CANCELLED','REJECTED')),
 CONSTRAINT commands_version_check CHECK(version>0),
 CONSTRAINT commands_expiration_check CHECK(expires_at>created_at),
 CONSTRAINT commands_type_check CHECK(type='FUTURE_COMMAND'),
 CONSTRAINT commands_idempotency_format_check CHECK(idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$')
);
CREATE UNIQUE INDEX commands_admin_device_idempotency_idx ON commands(admin_id,managed_device_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX commands_device_created_idx ON commands(managed_device_id,created_at DESC,id DESC);
CREATE INDEX commands_admin_created_idx ON commands(admin_id,created_at DESC,id DESC);
CREATE INDEX commands_status_expires_idx ON commands(status,expires_at);
CREATE TABLE command_events (
 id UUID PRIMARY KEY,
 command_id UUID NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
 from_status TEXT,
 to_status TEXT NOT NULL,
 actor_type TEXT NOT NULL,
 actor_id UUID,
 correlation_id UUID,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT command_events_actor_check CHECK(actor_type IN ('ADMIN','DEVICE','SYSTEM'))
);
CREATE INDEX command_events_command_occurred_idx ON command_events(command_id,occurred_at);
