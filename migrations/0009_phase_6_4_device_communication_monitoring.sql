ALTER TABLE device_connection_sessions
  ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN revoked_at TIMESTAMPTZ,
  ADD COLUMN connection_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX device_connection_sessions_last_seen_idx
  ON device_connection_sessions (managed_device_id, last_seen_at DESC);

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY managed_device_id
           ORDER BY last_seen_at DESC, created_at DESC, id DESC
         ) AS rn
  FROM device_connection_sessions
  WHERE state IN ('CONNECTING','CONNECTED','STALE')
)
UPDATE device_connection_sessions s
SET state='EXPIRED',
    disconnected_at=COALESCE(disconnected_at,NOW()),
    last_activity_at=NOW(),
    last_seen_at=NOW()
FROM ranked r
WHERE s.id=r.id AND r.rn>1;

CREATE UNIQUE INDEX device_connection_sessions_one_active_idx
  ON device_connection_sessions (managed_device_id)
  WHERE state IN ('CONNECTING', 'CONNECTED', 'STALE');

CREATE TABLE device_monitoring_snapshots (
  managed_device_id UUID PRIMARY KEY REFERENCES managed_devices(id) ON DELETE RESTRICT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  device_collected_at TIMESTAMPTZ NOT NULL,
  server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  android_version TEXT NOT NULL,
  api_level INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  app_version_code BIGINT NOT NULL,
  management_mode TEXT NOT NULL,
  battery_percentage INTEGER,
  charging_state TEXT NOT NULL,
  battery_status TEXT NOT NULL,
  network_state TEXT NOT NULL,
  storage_total_bytes BIGINT,
  storage_available_bytes BIGINT,
  storage_used_bytes BIGINT,
  memory_total_bytes BIGINT,
  memory_available_bytes BIGINT,
  memory_low BOOLEAN,
  last_successful_initialization_at TIMESTAMPTZ,
  last_successful_communication_at TIMESTAMPTZ,
  last_monitoring_update_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT device_monitoring_schema_check CHECK (schema_version > 0),
  CONSTRAINT device_monitoring_api_level_check CHECK (api_level > 0),
  CONSTRAINT device_monitoring_app_version_code_check CHECK (app_version_code >= 0),
  CONSTRAINT device_monitoring_battery_check CHECK (battery_percentage IS NULL OR (battery_percentage BETWEEN 0 AND 100)),
  CONSTRAINT device_monitoring_management_mode_check CHECK (management_mode IN ('NOT_MANAGED','PROFILE_OWNER','DEVICE_OWNER','UNKNOWN')),
  CONSTRAINT device_monitoring_charging_check CHECK (charging_state IN ('CHARGING','DISCHARGING','FULL','NOT_CHARGING','UNKNOWN')),
  CONSTRAINT device_monitoring_battery_status_check CHECK (battery_status IN ('NORMAL','LOW','CRITICAL','FULL','UNKNOWN')),
  CONSTRAINT device_monitoring_network_check CHECK (network_state IN ('UNKNOWN','OFFLINE','WIFI','CELLULAR','OTHER')),
  CONSTRAINT device_monitoring_storage_check CHECK (
    (storage_total_bytes IS NULL OR storage_total_bytes >= 0) AND
    (storage_available_bytes IS NULL OR storage_available_bytes >= 0) AND
    (storage_used_bytes IS NULL OR storage_used_bytes >= 0)
  ),
  CONSTRAINT device_monitoring_memory_check CHECK (
    (memory_total_bytes IS NULL OR memory_total_bytes >= 0) AND
    (memory_available_bytes IS NULL OR memory_available_bytes >= 0)
  ),
  CONSTRAINT device_monitoring_time_check CHECK (device_collected_at <= last_monitoring_update_at)
);

CREATE INDEX device_monitoring_freshness_idx
  ON device_monitoring_snapshots (server_received_at DESC, device_collected_at DESC);


CREATE OR REPLACE FUNCTION revoke_device_communication_state()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.enrollment_status = 'REVOKED' OR NEW.operational_status = 'REVOKED' THEN
    UPDATE device_credentials
      SET status = 'REVOKED', revoked_at = COALESCE(revoked_at, NOW())
      WHERE managed_device_id = NEW.id AND status = 'ACTIVE';

    UPDATE device_connection_sessions
      SET state = 'EXPIRED',
          disconnected_at = COALESCE(disconnected_at, NOW()),
          last_activity_at = NOW(),
          last_seen_at = NOW(),
          revoked_at = COALESCE(revoked_at, NOW())
      WHERE managed_device_id = NEW.id
        AND state IN ('CONNECTING', 'CONNECTED', 'STALE');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
