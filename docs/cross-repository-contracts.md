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

The authentication endpoints identify authorized administrator accounts and manage opaque server-side sessions. They do not implement managed-device operations.

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

Managed-device listing/details, policy operations, audit information, and realtime coordination remain future work.

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
