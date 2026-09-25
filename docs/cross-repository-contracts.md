# Parento — Cross-Repository Backend Contracts

## Current boundary

Parento consists of three separate repositories:

- gaje9dra/parento-backend — API and PostgreSQL persistence infrastructure.
- gaje9dra/parento-admin — administrator/controller Android application.
- gaje9dra/parento-managed — managed Android application.

Phase 2 backend work establishes the server-side persistence and HTTP foundation. Administrator authentication is now implemented in the backend foundation. Administrator authorization beyond authenticated identity, managed-device operations, and realtime communication remain future integration boundaries.

## Current interface

The backend currently exposes the versioned operational API boundary:

GET /api/v1/health
GET /api/v1/ready

It also exposes the Phase 3.1 administrator authentication boundary:

POST /api/v1/auth/admin/login
POST /api/v1/auth/admin/refresh
GET /api/v1/auth/admin/me
POST /api/v1/auth/admin/logout

The authentication endpoints identify authorized administrator accounts and manage opaque server-side sessions.

Phase 8 location integration also exposes the authenticated current-location boundary:

- POST /api/v1/device/location
- GET /api/v1/devices/{deviceId}/location

## Phase 2 identity and state compatibility

The backend owns server-side UUIDs for:

- admins.id
- managed_devices.id
- enrollments.id

managed_devices.stable_identifier is a separate server-side stable identifier. None of these values is the same contract as an Android installationId.

The Admin and Managed Android applications each maintain a locally generated installation UUID. Those local IDs identify an application installation only; they are not authenticated backend identities and must not be treated as administrator or managed-device authorization credentials.

Backend lifecycle state is server-authoritative only for the records represented by the backend schema:

- Admin status: ACTIVE, DISABLED
- Managed-device enrollment status: PENDING, ACTIVE, REVOKED
- Managed-device operational status: PENDING, ACTIVE, REVOKED
- Enrollment status: PENDING, COMPLETED, EXPIRED, REVOKED

The Managed Android lifecycle and runtime connection state are separate local models. The Admin local setup state is also a local application state. Future API integration must define explicit mappings rather than assuming enum names or values are interchangeable.

## Timestamp and serialization boundary

Backend timestamps use PostgreSQL TIMESTAMPTZ. Android local persistence uses epoch-millisecond values. A future API contract must serialize server timestamps explicitly, such as UTC/ISO-8601 strings, and convert them at the Android API boundary.

Android epoch-millisecond persistence fields are not wire-format contracts.

## Error boundary

The backend exposes structured HTTP errors using an error code, message, and request ID. Android repositories currently expose domain-level errors and do not perform API translation.

Future API clients must map stable backend error codes to appropriate Android domain errors without exposing raw PostgreSQL, Room, or infrastructure exceptions to UI.

## Admin integration boundary

parento-admin will consume the Phase 3.1 administrator authentication contract in its repository-specific integration phase.

Implemented backend authentication includes administrator credential verification, account-status enforcement, opaque access/refresh sessions, authenticated-admin identity, and logout/session invalidation.

Managed-device listing/details, policy operations, and audit information remain future work. Location retrieval is an explicit exception: it is ownership-authorized, current-state only, and has no location-history API.

## Future Managed integration

parento-managed will eventually require authenticated and authorized APIs for enrollment, device identity, status, policy application, and other permitted management operations.

Enrollment, device identity provisioning, commands, and policy enforcement are intentionally not implemented in Phase 2.

## Contract principles

- Backend contracts must be explicitly versioned.
- Authentication and authorization must be enforced before sensitive operations.
- Device-management operations must be attributable to an authorized principal.
- Sensitive values must never be returned through operational health endpoints.
- Request IDs are correlation identifiers, not credentials.
- Android repositories remain independent from backend implementation details.
- Cross-repository enum, timestamp, identifier, and error mappings must be explicit when integration is introduced.

## Deferred

No fake authentication endpoints, fake device endpoints, QR pairing endpoints, command endpoints, WebSocket endpoints, or surveillance mechanisms are introduced merely to document future integration.



## Phase 8 location contract

### Managed Android reporting

POST /api/v1/device/location requires the existing managed-device
communication session bearer token. The authenticated session supplies the
ManagedDevice identity; the request does not establish ownership through a
client-supplied device ID.

The request contains:

- reportId — UUID idempotency identifier
- availability — AVAILABLE or UNAVAILABLE
- latitude/longitude — required for AVAILABLE, absent for UNAVAILABLE
- accuracyMeters — optional for AVAILABLE, absent for UNAVAILABLE
- observedAt — device-observed ISO-8601 timestamp

The backend assigns receivedAt. Reports more than five minutes in the future
are rejected. Older reports cannot replace newer current state. Exact retries
of an already accepted report are safe no-ops; reuse of a reportId with
different report data is rejected.

### Admin retrieval

GET /api/v1/devices/{deviceId}/location requires an authenticated active Admin.
The backend verifies that the requested ManagedDevice belongs to that Admin
before reading its current location.

The response exposes only the current location state and centralized freshness:
FRESH, STALE, VERY_STALE, UNKNOWN, or NEVER_REPORTED.

Missing/unavailable location is represented with null location data or an
UNAVAILABLE state; fake coordinates are never used.

### Privacy and retention

Only one current location row is retained per ManagedDevice. The backend does
not expose a location-history endpoint and does not log exact coordinates in
normal application/security events.

Both location endpoints use the configured location rate limit when
RATE_LIMIT_ENABLED is true. The device-report and Admin-retrieval limiters use
the existing RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX_REQUESTS configuration
independently.
