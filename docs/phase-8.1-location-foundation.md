# Phase 8.1 — Location System Backend Foundation

## Scope

This phase adds only the backend foundation for authorized managed-device location reporting. Android collection and Admin map UI are deferred.

## Domain

Each ManagedDevice has one authoritative current location state. The state records availability, coordinates when available, accuracy when supplied, the device-observed timestamp, backend receipt timestamp, and the report identifier. There is no unlimited location history in this phase.

## Authentication and authorization

- Device reporting uses the existing Phase 6 device-session bearer authentication.
- The authenticated session determines the ManagedDevice; a client-supplied device ID is not an authorization boundary.
- Reporting is accepted only for an ACTIVE enrolled and operational device.
- Admin retrieval uses the existing Admin bearer authentication and verifies managed_devices.admin_id before reading location data.
- Revoked devices are rejected by the device-status check and existing session revocation flow.

## Timestamp and ordering policy

observedAt is the device observation time. receivedAt is always assigned by the backend. Reports more than five minutes in the future are rejected. Past timestamps are accepted because delayed delivery is expected; freshness is derived from observedAt.

The database upsert replaces the current state only when the incoming observedAt is strictly newer. Therefore a delayed older report cannot replace a newer location, and equal/older duplicate deliveries are deterministic no-ops.

## Freshness

- FRESH: observed within 5 minutes.
- STALE: observed more than 5 minutes and at most 30 minutes ago.
- VERY_STALE: older than 30 minutes.
- UNKNOWN: a state exists but availability is UNAVAILABLE.
- NEVER_REPORTED: no location state exists.

A stale location is explicitly returned as stale and is never represented as live/current telemetry.

## Privacy and retention

Only the latest state is retained. There is no unbounded history, history endpoint, geospatial extension, or public/anonymous endpoint. Raw coordinates are not included in application log events by this feature. The existing API/realtime stack remains the server-side trust boundary.

## Cross-repository contracts

parento-managed will later call POST /api/v1/device/location with the authenticated device-session token. It must use legitimate Android location APIs and permissions. parento-admin will later call GET /api/v1/devices/{deviceId}/location using an authenticated Admin session and must render freshness explicitly. Neither repository is changed in Phase 8.1.

## Deferred

- Android location permissions and collection
- background location collection
- Admin map UI
- location history
- Phase 9+ device-control/surveillance features

## Verification

The repository verification workflow runs formatting, lint, type checking,
database migration checks, tests, build, and dependency audit for this phase.
