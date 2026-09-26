CREATE TABLE screen_sharing_sessions (
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
  CONSTRAINT screen_sharing_status_check CHECK (
    status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING','STOPPED','EXPIRED','FAILED','REJECTED')
  ),
  CONSTRAINT screen_sharing_termination_reason_check CHECK (
    termination_reason IS NULL OR termination_reason IN (
      'ADMIN_STOP','EXPIRED','DEVICE_DISCONNECTED','DEVICE_REVOKED',
      'ADMIN_DISABLED','FAILED','REJECTED','UNKNOWN'
    )
  ),
  CONSTRAINT screen_sharing_expiration_check CHECK (expires_at > created_at),
  CONSTRAINT screen_sharing_transport_object_check CHECK (
    transport_state IS NULL OR jsonb_typeof(transport_state) = 'object'
  )
);

CREATE INDEX screen_sharing_device_status_idx
  ON screen_sharing_sessions (managed_device_id, status, created_at DESC);
CREATE INDEX screen_sharing_admin_created_idx
  ON screen_sharing_sessions (admin_id, created_at DESC);
CREATE INDEX screen_sharing_expiry_idx
  ON screen_sharing_sessions (status, expires_at);
CREATE UNIQUE INDEX screen_sharing_one_active_device_idx
  ON screen_sharing_sessions (managed_device_id)
  WHERE status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING');

CREATE TABLE screen_sharing_session_events (
  id UUID PRIMARY KEY,
  screen_session_id UUID NOT NULL REFERENCES screen_sharing_sessions(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  termination_reason TEXT,
  CONSTRAINT screen_sharing_events_to_status_check CHECK (
    to_status IN ('REQUESTED','AUTHORIZED','STARTING','ACTIVE','STOPPING','STOPPED','EXPIRED','FAILED','REJECTED')
  ),
  CONSTRAINT screen_sharing_events_reason_check CHECK (
    termination_reason IS NULL OR termination_reason IN (
      'ADMIN_STOP','EXPIRED','DEVICE_DISCONNECTED','DEVICE_REVOKED',
      'ADMIN_DISABLED','FAILED','REJECTED','UNKNOWN'
    )
  )
);

CREATE INDEX screen_sharing_events_session_time_idx
  ON screen_sharing_session_events (screen_session_id, occurred_at ASC, id ASC);

ALTER TABLE commands
  DROP CONSTRAINT commands_type_check;

ALTER TABLE commands
  ADD CONSTRAINT commands_type_check CHECK (
    type IN ('FUTURE_COMMAND','START_SCREEN_SHARE','STOP_SCREEN_SHARE')
  );
