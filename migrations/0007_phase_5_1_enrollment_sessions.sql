CREATE TABLE enrollment_sessions (
  id UUID PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  secret_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  managed_device_id UUID REFERENCES managed_devices(id) ON DELETE RESTRICT,
  verification_attempts INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT enrollment_sessions_status_check
    CHECK (status IN ('CREATED', 'PENDING', 'VERIFIED', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'REVOKED', 'FAILED')),
  CONSTRAINT enrollment_sessions_expiration_check
    CHECK (expires_at > created_at),
  CONSTRAINT enrollment_sessions_attempts_check
    CHECK (verification_attempts >= 0),
  CONSTRAINT enrollment_sessions_completed_check
    CHECK (
      (status = 'COMPLETED' AND completed_at IS NOT NULL AND managed_device_id IS NOT NULL)
      OR status <> 'COMPLETED'
    ),
  CONSTRAINT enrollment_sessions_cancelled_check
    CHECK (
      (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
      OR status <> 'CANCELLED'
    )
);

CREATE INDEX enrollment_sessions_admin_created_idx
  ON enrollment_sessions (admin_id, created_at DESC, id DESC);

CREATE INDEX enrollment_sessions_status_expires_idx
  ON enrollment_sessions (status, expires_at);

CREATE INDEX enrollment_sessions_managed_device_idx
  ON enrollment_sessions (managed_device_id);
