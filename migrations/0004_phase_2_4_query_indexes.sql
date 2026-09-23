CREATE INDEX managed_devices_admin_created_id_idx
  ON managed_devices (admin_id, created_at DESC, id DESC);

CREATE INDEX enrollments_admin_created_id_idx
  ON enrollments (admin_id, created_at DESC, id DESC);

CREATE INDEX enrollments_device_created_id_idx
  ON enrollments (device_id, created_at DESC, id DESC);

DROP INDEX IF EXISTS managed_devices_stable_identifier_idx;
