# Phase 5.1 — Secure Device Enrollment & Pairing Foundation

Phase 5.1 establishes the backend-only foundation for intentional, administrator-authorized enrollment of a managed Android installation.

## Repository boundary

Only `gaje9dra/parento-backend` is changed by this phase.

The Managed Android and Admin Android repositories are not modified.

## Enrollment architecture

The Phase 2 `enrollments` table is retained for historical/domain compatibility. Phase 5.1 adds `enrollment_sessions` as the temporary authorization primitive required for secure pairing.

Conceptually:

```
Authenticated Admin
       |
       v
Enrollment Session
       |
       | one-time authorization secret
       v
Managed Android installation
       |
       v
ManagedDevice
```

The local installation identity is an application-generated identifier. It is not authentication, proof of ownership, or a hardware fingerprint.

## State machine

Supported states:

- `CREATED`
- `PENDING`
- `VERIFIED`
- `COMPLETED`
- `EXPIRED`
- `CANCELLED`
- `REVOKED`
- `FAILED`

The API creates sessions in `PENDING`. The explicit domain state machine prevents arbitrary transitions.

Normal successful lifecycle:

```
CREATED -> PENDING -> VERIFIED -> COMPLETED
```

Expiration, cancellation, revocation, and verification failure are terminal from their respective states.

## Authorization

Enrollment creation, listing, status, and cancellation require the existing administrator authentication and authorization middleware.

The administrator ID is always derived from the authenticated opaque session. No endpoint accepts a client-supplied `adminId` as authority.

Enrollment consumption uses the one-time authorization secret. The consuming client does not supply an administrator identity.

The backend also checks that the owning administrator is still `ACTIVE` before completing an enrollment.

## Secret handling

- Secrets are generated with Node's cryptographically secure `randomBytes(32)`.
- The 32-byte value is represented as a 43-character base64url token.
- Only a SHA-256 verification hash is stored.
- The raw secret is returned once from the creation response.
- Secrets are never logged.
- Authorization secrets are not placed in URLs.
- Verification compares stored and presented hashes using a constant-time comparison.

The authorization secret is intentionally temporary and single-use.

## Expiration

The default enrollment-session lifetime is 15 minutes and is configurable with:

- `ENROLLMENT_SESSION_TTL_SECONDS`

The maximum configured lifetime is 24 hours.

Expiration is enforced at request time. No background cleanup worker is required for security.

## One-time consumption

Consumption is performed inside a PostgreSQL transaction.

The transaction:

1. locks the enrollment session;
2. validates state and server-side expiration;
3. verifies the authorization secret;
4. verifies the owning administrator remains active;
5. checks the installation identity for existing association;
6. creates the managed device;
7. marks the enrollment session `COMPLETED`.

Concurrent consumers therefore cannot both complete the same session.

A replay after completion fails.

## Device identity

The consuming client supplies only a local installation identity, device display name, and platform.

Validation:

- installation identity: 8–128 characters using `A-Za-z0-9._:-`;
- name: 1–100 characters;
- platform: `android`.

No IMEI, serial number, MAC address, advertising ID, or other hardware fingerprint is collected.

A stable installation identity is unique in the existing `managed_devices` schema. Existing associations are rejected rather than silently transferred.

## API

### Create

`POST /api/v1/devices/enrollments`

Requires an authenticated active administrator.

Response contains:

- enrollment metadata;
- expiration;
- one-time `authorizationSecret`.

The raw secret must be treated as sensitive and must not be persisted by the backend.

### List

`GET /api/v1/devices/enrollments`

Returns only sessions owned by the authenticated administrator.

### Status

`GET /api/v1/devices/enrollments/{enrollmentId}`

Returns an enrollment only when it belongs to the authenticated administrator.

### Cancel

`POST /api/v1/devices/enrollments/{enrollmentId}/cancel`

Only the owning active administrator can cancel a pending session. Cancellation is idempotent for an already-cancelled session. Completed sessions cannot be cancelled.

### Consume

`POST /api/v1/devices/enrollments/{enrollmentId}/consume`

Request:

```json
{
  "authorizationSecret": "<one-time-secret>",
  "localInstallationIdentity": "<managed-app-generated-id>",
  "name": "Child Device",
  "platform": "android"
}
```

The operation creates the `ManagedDevice` association and completes the enrollment atomically.

This endpoint is deliberately not an authenticated-admin endpoint because the future managed Android application will use the one-time authorization material. It is nevertheless protected by high-entropy secret material, expiration, one-time consumption, attempt limits, and rate limiting.

## Rate limiting

Enrollment verification uses a dedicated configurable limiter:

- `ENROLLMENT_VERIFICATION_WINDOW_MS`
- `ENROLLMENT_VERIFICATION_MAX_REQUESTS`

The default is 10 verification requests per minute per network peer.

A separate per-session verification-attempt counter is also bounded by:

- `ENROLLMENT_VERIFICATION_MAX_ATTEMPTS`

The default is 10 failed attempts.

At scale, the existing process-local rate-limit store must be replaced with a shared trusted store or equivalent edge control.

## Enumeration protection

Ownership-scoped admin endpoints return the same not-found behavior when an enrollment does not belong to the authenticated administrator.

Verification failures do not reveal whether a secret was close to valid. Secrets and authorization headers are excluded from application logging.

## Error contract

Enrollment-specific errors use the existing JSON error envelope and include:

- `ENROLLMENT_NOT_FOUND`
- `ENROLLMENT_EXPIRED`
- `ENROLLMENT_ALREADY_CONSUMED`
- `ENROLLMENT_STATE_CONFLICT`
- `INVALID_ENROLLMENT_VERIFICATION`
- `DEVICE_IDENTITY_CONFLICT`
- `RATE_LIMITED`

Internal database errors are mapped through the existing persistence/error boundary.

## Database

Migration:

`migrations/0007_phase_5_1_enrollment_sessions.sql`

The new table includes:

- administrator foreign key;
- state constraint;
- expiration constraint;
- completion/cancellation consistency constraints;
- unique secret hash;
- managed-device foreign key;
- verification-attempt counter;
- indexes for administrator listing, status/expiration, and device association.

Existing managed-device uniqueness remains authoritative for stable installation identity.

## Auditability and logging

Security-relevant events are logged without secrets:

- enrollment created;
- enrollment verification failed;
- enrollment completed;
- enrollment cancelled.

Logged identifiers are internal enrollment/admin/device IDs where needed for correlation. Raw authorization secrets, access tokens, passwords, and installation identity values are not logged.

## Cross-repository contract

The future Managed Android implementation will need to:

1. receive the administrator-generated authorization secret through an intentional user-visible enrollment flow;
2. generate/use its existing local installation identity;
3. call the consume endpoint over secure transport;
4. send only the documented request fields;
5. treat expiration, one-time-use, cancellation, and authorization errors as terminal enrollment outcomes;
6. persist the returned backend `managedDeviceId` only after successful completion.

The Managed Android repository remains unchanged in Phase 5.1.

The future Admin Android implementation will need to:

1. authenticate using the existing admin session;
2. call the create endpoint;
3. display/transfer the one-time authorization secret through an intentional enrollment flow;
4. poll or query the owned enrollment status endpoint using the enrollment ID;
5. support cancellation.

No QR format or client-side pairing UI is defined yet.

## Threat-model review

| Threat                          | Mitigation                                                           |
| ------------------------------- | -------------------------------------------------------------------- |
| Secret theft                    | high entropy, expiration, one-time use, rate limits, no logging      |
| Secret guessing                 | 256-bit random secret, rate limits, bounded attempts                 |
| Replay                          | transactional state transition and row lock                          |
| Cross-admin access              | authenticated ownership checks                                       |
| Disabled owner                  | active-admin check during completion                                 |
| Concurrent consumers            | PostgreSQL transaction and row locking                               |
| Expired authorization           | server-side expiration check                                         |
| Device identity duplication     | unique database constraint and explicit conflict                     |
| Partial completion              | managed-device creation and session completion share one transaction |
| Client-supplied admin identity  | not accepted                                                         |
| Hardware fingerprint harvesting | not collected                                                        |

## Deferred functionality

Phase 5.1 does not implement:

- Android enrollment client;
- QR pairing UI;
- backend realtime communication;
- WebSockets;
- FCM;
- heartbeat/telemetry;
- remote commands;
- location;
- camera;
- microphone;
- audio;
- screen capture;
- app blocking;
- website/network filtering;
- device locking;
- remote wipe;
- policy execution.

Those remain later-phase work.
