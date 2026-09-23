ALTER TABLE managed_devices
  ADD COLUMN stable_identifier TEXT;

UPDATE managed_devices
SET stable_identifier = id::text
WHERE stable_identifier IS NULL;

ALTER TABLE managed_devices
  ALTER COLUMN stable_identifier SET NOT NULL;

ALTER TABLE managed_devices
  ADD CONSTRAINT managed_devices_stable_identifier_unique
  UNIQUE (stable_identifier);

ALTER TABLE managed_devices
  ADD CONSTRAINT managed_devices_stable_identifier_check
  CHECK (length(btrim(stable_identifier)) > 0);

ALTER TABLE managed_devices
  ADD CONSTRAINT managed_devices_id_admin_unique
  UNIQUE (id, admin_id);

ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_device_admin_fk
  FOREIGN KEY (device_id, admin_id)
  REFERENCES managed_devices (id, admin_id)
  ON DELETE RESTRICT;

ALTER TABLE enrollments
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_completed_timestamp_check
  CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL)
    OR status <> 'COMPLETED'
  );

CREATE INDEX managed_devices_stable_identifier_idx
  ON managed_devices (stable_identifier);

CREATE INDEX enrollments_admin_device_idx
  ON enrollments (admin_id, device_id);
