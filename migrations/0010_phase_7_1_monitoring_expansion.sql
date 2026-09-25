CREATE INDEX device_monitoring_management_mode_idx
  ON device_monitoring_snapshots (management_mode, server_received_at DESC);

ALTER TABLE device_monitoring_snapshots
  ADD CONSTRAINT device_monitoring_storage_capacity_check CHECK (
    storage_total_bytes IS NULL OR
    (
      (storage_available_bytes IS NULL OR storage_available_bytes <= storage_total_bytes) AND
      (storage_used_bytes IS NULL OR storage_used_bytes <= storage_total_bytes) AND
      (
        storage_available_bytes IS NULL OR
        storage_used_bytes IS NULL OR
        storage_available_bytes <= storage_total_bytes - storage_used_bytes
      )
    )
  ),
  ADD CONSTRAINT device_monitoring_memory_capacity_check CHECK (
    memory_total_bytes IS NULL OR
    memory_available_bytes IS NULL OR
    memory_available_bytes <= memory_total_bytes
  );

CREATE INDEX device_monitoring_device_collected_idx
  ON device_monitoring_snapshots (managed_device_id, device_collected_at DESC);
