CREATE TABLE device_monitoring_state (
  managed_device_id UUID PRIMARY KEY REFERENCES managed_devices(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  android_version TEXT,
  api_level INTEGER,
  app_version TEXT,
  app_version_code BIGINT,
  battery_percentage INTEGER,
  battery_charging_state TEXT,
  battery_status TEXT,
  network_state TEXT,
  storage_total_bytes BIGINT,
  storage_available_bytes BIGINT,
  storage_used_bytes BIGINT,
  memory_total_bytes BIGINT,
  memory_available_bytes BIGINT,
  memory_low BOOLEAN,
  management_mode TEXT,
  last_successful_initialization_at TIMESTAMPTZ,
  last_successful_communication_at TIMESTAMPTZ,
  CONSTRAINT device_monitoring_schema_version_check CHECK (schema_version = 1),
  CONSTRAINT device_monitoring_api_level_check CHECK (api_level IS NULL OR api_level BETWEEN 1 AND 100),
  CONSTRAINT device_monitoring_battery_check CHECK (battery_percentage IS NULL OR battery_percentage BETWEEN 0 AND 100),
  CONSTRAINT device_monitoring_battery_charging_check CHECK (
    battery_charging_state IS NULL OR battery_charging_state IN ('CHARGING','DISCHARGING','FULL','NOT_CHARGING','UNKNOWN')
  ),
  CONSTRAINT device_monitoring_battery_status_check CHECK (
    battery_status IS NULL OR battery_status IN ('NORMAL','LOW','CRITICAL','FULL','UNKNOWN')
  ),
  CONSTRAINT device_monitoring_network_check CHECK (
    network_state IS NULL OR network_state IN ('UNKNOWN','OFFLINE','WIFI','CELLULAR','OTHER')
  ),
  CONSTRAINT device_monitoring_management_check CHECK (
    management_mode IS NULL OR management_mode IN ('UNMANAGED','PROFILE_OWNER','DEVICE_OWNER','UNKNOWN')
  ),
  CONSTRAINT device_monitoring_storage_nonnegative_check CHECK (
    (storage_total_bytes IS NULL OR storage_total_bytes >= 0) AND
    (storage_available_bytes IS NULL OR storage_available_bytes >= 0) AND
    (storage_used_bytes IS NULL OR storage_used_bytes >= 0)
  ),
  CONSTRAINT device_monitoring_memory_nonnegative_check CHECK (
    (memory_total_bytes IS NULL OR memory_total_bytes >= 0) AND
    (memory_available_bytes IS NULL OR memory_available_bytes >= 0)
  )
);

CREATE INDEX device_monitoring_observed_idx
  ON device_monitoring_state (observed_at DESC, managed_device_id DESC);
CREATE INDEX device_monitoring_app_version_idx
  ON device_monitoring_state (app_version);

COMMENT ON TABLE device_monitoring_state IS
  'Single authoritative current operational monitoring snapshot per managed device. No historical telemetry is retained in Phase 7.';
COMMENT ON COLUMN device_monitoring_state.observed_at IS
  'Client observation time used only for freshness/order; server received_at remains authoritative for ingestion time.';
