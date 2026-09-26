# Phase 8.4 — Backend Location Security, Reliability & Privacy Hardening

## Repository boundary

Only `gaje9dra/parento-backend` is modified in this phase. The Managed Android and Admin Android repositories are external consumers and were not changed.

## Existing Phase 8.1 architecture

Phase 8.1 already provides:

- authenticated managed-device sessions
- active enrollment/operational-state checks
- Admin authentication and ownership authorization
- server-side coordinate and accuracy validation
- backend-controlled `receivedAt`
- future-clock-skew protection
- one latest location row per managed device
- report UUID uniqueness
- atomic timestamp-ordered upsert
- centralized freshness classification
- authenticated API retrieval/reporting

Phase 8.4 hardens those boundaries without creating a parallel transport, authentication system, telemetry pipeline, or realtime connection.

## Security boundary

### Managed device

Location reporting requires the existing device-session middleware and therefore an authenticated session tied to a specific managed device. The service then resolves that device server-side and requires both enrollment and operational status to be ACTIVE.

Client-supplied device ownership is never accepted.

### Admin

Location retrieval uses the existing Admin authentication middleware and then checks that the requested managed device's `adminId` matches the authenticated Admin.

### Revocation

A revoked device fails the service authorization check. Existing device-session revocation support also expires sessions when a device is revoked.

## Validation

The API schema and service validate:

- strict request shape
- UUID report identifiers
- finite latitude/longitude
- latitude range -90..90
- longitude range -180..180
- maximum coordinate precision of 7 decimal places
- finite non-negative accuracy
- accuracy maximum of 100,000 meters
- available reports must contain coordinates
- unavailable reports must contain no coordinates or accuracy
- valid observed timestamps
- maximum future clock skew of 5 minutes

Migration 0010 adds database-level NaN defenses for latitude, longitude, and accuracy as defense in depth.

Invalid values are rejected; they are never silently clamped.

## Timestamp policy

`observedAt` represents device observation time.

`receivedAt` is assigned by the backend and represents ingestion time.

Device timestamps may be behind the server and are therefore not used as the sole security mechanism. Future timestamps more than five minutes ahead of backend time are rejected.

Very old observations are allowed to reach the ordering layer because delayed/offline delivery is a legitimate failure mode. Such observations cannot overwrite a newer current location because the database upsert only applies when the incoming `observedAt` is strictly newer.

Freshness is calculated centrally from `observedAt`:

- <= 5 minutes: FRESH
- > 5 and <= 30 minutes: STALE
- > 30 minutes: VERY_STALE
- unavailable/no location: UNKNOWN/NEVER_REPORTED

## Replay and idempotency

The location table has:

- one row per managed device
- a unique `report_id`
- atomic `ON CONFLICT (managed_device_id)` ordering by `observed_at`

Consequences:

- duplicate report identifiers cannot create additional rows
- a duplicate of the current report does not replace the record
- an older delayed report cannot overwrite a newer observation
- concurrent writes for the same device are resolved by PostgreSQL's unique-row conflict handling
- storage remains bounded to one current location record per managed device

## Concurrency

The current-location update is a single database upsert with a conditional conflict update. The comparison against the stored `observed_at` happens inside the database operation, so request arrival order cannot make an older observation replace a newer one.

Persistence failures remain persistence errors rather than being silently presented as successful location updates.

## Retention and privacy

Phase 8.1 stores only the latest location state. Phase 8.4 does not introduce location history.

The location table is therefore bounded at one row per managed device.

No location coordinates are added to normal request/application logs. Existing request logging redacts authorization headers and cookies and does not log request bodies by default.

API error responses do not expose database details or stack traces.

## Rate limiting

Location reporting uses the existing device-communication rate limiter. No location-specific high-frequency transport or bypass is introduced.

## Realtime

The current Phase 6 realtime architecture is command-delivery oriented and does not expose a location event contract. Phase 8.4 therefore does not create a second WebSocket, event bus, or socket connection. Location remains ordinary authenticated API telemetry/retrieval.

If a future realtime location event is introduced, it must reuse the existing authenticated/realtime authorization boundary rather than create a parallel channel.

## Database

Migration `0012_phase_8_1_location_foundation.sql` remains the location schema foundation.

Migration `0013_phase_8_4_location_hardening.sql` adds database-level NaN constraints for numeric location fields.

Existing indexes cover report uniqueness and observed/received timestamp queries.

## Client contract

No client repository changes are required by the hardening changes.

The existing endpoint contract remains:

- `POST /api/v1/device/location`
- `GET /api/v1/devices/:deviceId/location`

Managed and Admin clients should continue using the existing authenticated contracts.

## Out of scope

Not implemented:

- new Android location collection
- Admin map changes
- location history
- geofencing
- route tracking
- location analytics
- camera/microphone/audio
- screen sharing/recording
- application or website blocking
- device locking
- remote wipe
- arbitrary shell/code execution
- covert tracking
- permission bypasses
- iOS functionality
- unrelated Phase 9+ features
