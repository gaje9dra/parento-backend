-- Phase 8.4 location hardening.
-- Reject IEEE NaN values at the database boundary as a defense in depth measure.
ALTER TABLE managed_device_locations
  ADD CONSTRAINT managed_device_locations_latitude_finite_check
  CHECK (latitude IS NULL OR latitude <> 'NaN'::double precision),
  ADD CONSTRAINT managed_device_locations_longitude_finite_check
  CHECK (longitude IS NULL OR longitude <> 'NaN'::double precision),
  ADD CONSTRAINT managed_device_locations_accuracy_finite_check
  CHECK (accuracy_meters IS NULL OR accuracy_meters <> 'NaN'::double precision);
