CREATE TABLE managed_device_locations (
  managed_device_id UUID PRIMARY KEY REFERENCES managed_devices(id) ON DELETE RESTRICT,
  availability TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_meters DOUBLE PRECISION,
  observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  report_id UUID NOT NULL,
  CONSTRAINT managed_device_locations_availability_check CHECK (availability IN ('AVAILABLE', 'UNAVAILABLE')),
  CONSTRAINT managed_device_locations_coordinate_pair_check CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT managed_device_locations_latitude_check CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT managed_device_locations_longitude_check CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  CONSTRAINT managed_device_locations_accuracy_check CHECK (accuracy_meters IS NULL OR (accuracy_meters >= 0 AND accuracy_meters <= 100000)),
  CONSTRAINT managed_device_locations_availability_data_check CHECK (
    (availability = 'AVAILABLE' AND latitude IS NOT NULL AND longitude IS NOT NULL)
    OR (availability = 'UNAVAILABLE' AND latitude IS NULL AND longitude IS NULL AND accuracy_meters IS NULL)
  )
);
CREATE UNIQUE INDEX managed_device_locations_report_id_idx ON managed_device_locations (report_id);
CREATE INDEX managed_device_locations_observed_idx ON managed_device_locations (observed_at DESC, managed_device_id);
CREATE INDEX managed_device_locations_received_idx ON managed_device_locations (received_at DESC, managed_device_id);
