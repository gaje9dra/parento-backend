ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_secret_hash_format_check
  CHECK (secret_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_verified_timestamp_check
  CHECK (
    (status = 'VERIFIED' AND verified_at IS NOT NULL)
    OR (status <> 'VERIFIED')
  );

ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_verified_timestamp_state_check
  CHECK (
    verified_at IS NULL
    OR status IN ('VERIFIED', 'COMPLETED', 'REVOKED')
  );

ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_completed_timestamp_check
  CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL)
    OR (status <> 'COMPLETED')
  );

ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_completed_timestamp_state_check
  CHECK (
    completed_at IS NULL
    OR status IN ('COMPLETED', 'REVOKED')
  );

ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_managed_device_check
  CHECK (
    (status = 'COMPLETED' AND managed_device_id IS NOT NULL)
    OR (status <> 'COMPLETED')
  );

ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_managed_device_state_check
  CHECK (
    managed_device_id IS NULL
    OR status IN ('COMPLETED', 'REVOKED')
  );

ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_cancelled_timestamp_check
  CHECK (
    (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
    OR (status <> 'CANCELLED')
  );

ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_cancelled_timestamp_state_check
  CHECK (
    cancelled_at IS NULL
    OR status = 'CANCELLED'
  );
