ALTER TABLE admins
  ADD COLUMN password_hash TEXT,
  ADD COLUMN last_authenticated_at TIMESTAMPTZ;

CREATE TABLE admin_sessions (
  id UUID PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  access_expires_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_sessions_access_expiration_check
    CHECK (access_expires_at <= expires_at),
  CONSTRAINT admin_sessions_expiration_check
    CHECK (expires_at > created_at)
);

CREATE INDEX admin_sessions_admin_id_idx
  ON admin_sessions (admin_id);

CREATE INDEX admin_sessions_access_expiry_idx
  ON admin_sessions (access_expires_at);

CREATE INDEX admin_sessions_expiry_idx
  ON admin_sessions (expires_at);
