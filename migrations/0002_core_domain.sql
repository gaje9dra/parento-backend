CREATE TABLE admins (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admins_status_check CHECK (status IN ('ACTIVE', 'DISABLED'))
);
CREATE UNIQUE INDEX admins_email_unique_idx ON admins (LOWER(email));

CREATE TABLE managed_devices (
  id UUID PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  enrollment_status TEXT NOT NULL DEFAULT 'PENDING',
  operational_status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  CONSTRAINT managed_devices_enrollment_status_check
    CHECK (enrollment_status IN ('PENDING', 'ACTIVE', 'REVOKED')),
  CONSTRAINT managed_devices_operational_status_check
    CHECK (operational_status IN ('PENDING', 'ACTIVE', 'REVOKED'))
);
CREATE INDEX managed_devices_admin_id_idx ON managed_devices (admin_id);
CREATE INDEX managed_devices_status_idx ON managed_devices (enrollment_status, operational_status);

CREATE TABLE enrollments (
  id UUID PRIMARY KEY,
  enrollment_identifier TEXT NOT NULL UNIQUE,
  device_id UUID NOT NULL REFERENCES managed_devices(id) ON DELETE RESTRICT,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  CONSTRAINT enrollments_status_check
    CHECK (status IN ('PENDING', 'COMPLETED', 'EXPIRED', 'REVOKED')),
  CONSTRAINT enrollments_expiration_check CHECK (expires_at > created_at),
  CONSTRAINT enrollments_completed_check CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL)
    OR status <> 'COMPLETED'
  )
);
CREATE INDEX enrollments_device_id_idx ON enrollments (device_id);
CREATE INDEX enrollments_admin_id_idx ON enrollments (admin_id);
CREATE INDEX enrollments_status_idx ON enrollments (status);
CREATE INDEX enrollments_expires_at_idx ON enrollments (expires_at);
