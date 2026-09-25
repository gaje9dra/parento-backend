ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_secret_hash_format_check
  CHECK (secret_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_verified_timestamp_check
  CHECK (
    (status IN ('VERIFIED', 'COMPLETED') AND verified_at IS NOT NULL)
    OR (status NOT IN ('VERIFIED', 'COMPLETED') AND verified_at IS NULL)
  );

ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_completed_timestamp_check
  CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL)
    OR (status <> 'COMPLETED' AND completed_at IS NULL)
  );

ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_managed_device_check
  CHECK (
    (status = 'COMPLETED' AND managed_device_id IS NOT NULL)
    OR (status <> 'COMPLETED' AND managed_device_id IS NULL)
  );

ALTER TABLE enrollment_sessions
  ADD CONSTRAINT enrollment_sessions_cancelled_timestamp_check
  CHECK (
    (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
    OR (status <> 'CANCELLED' AND cancelled_at IS NULL)
  );
