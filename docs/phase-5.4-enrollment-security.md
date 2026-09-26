# Phase 5.4 — Enrollment Security Hardening & Phase 5 Backend Completion

## Repository boundary

Only `gaje9dra/parento-backend` is modified by Phase 5.4.

The Admin Android and Managed Android repositories are not changed.

## Final Phase 5 enrollment model

Phase 5 uses the temporary `enrollment_sessions` security boundary introduced in Phase 5.1. The older `enrollments` domain table remains part of the historical persistence model and is not used as the one-time pairing credential.

Conceptually:

```
Authenticated ACTIVE Admin
        |
        v
Enrollment Session
        |
        | 256-bit random one-time secret
        v
Managed Android installation
        |
        v
ManagedDevice
```

The managed installation identity is application-generated and is distinct from the backend ManagedDevice UUID, enrollment-session UUID, administrator identity, and Android management identity. No hardware fingerprinting is introduced.

## State machine

Supported enrollment-session states are:

- `CREATED`
- `PENDING`
- `VERIFIED`
- `COMPLETED`
- `EXPIRED`
- `CANCELLED`
- `REVOKED`
- `FAILED`

The API currently creates sessions in `PENDING` and consumes them directly into `COMPLETED`. `VERIFIED` remains an explicit domain state for future protocol steps but is not fabricated by the current consume endpoint.

Valid domain transitions are enforced by the existing domain state machine. Security-sensitive repository operations also validate the current state under database transaction/row locking.

Terminal states cannot be consumed again.

## Pairing secret security

- Authorization material is generated with Node `randomBytes(32)`.
- The raw value is a 256-bit, 43-character base64url token.
- Only the SHA-256 digest is persisted.
- The raw secret is returned only from enrollment creation.
- The raw secret is not logged, stored in URLs, or returned from status/list endpoints.
- Verification uses constant-time comparison of equal-length digests.
- Failed verification attempts are counted transactionally.
- The session becomes `FAILED` when the configured maximum failed-attempt count is reached.

The existing configuration defaults remain 10 failed attempts and 10 verification requests per minute.

## Expiration

The backend is authoritative for expiration. Client clocks are not trusted.

Consumption checks expiration inside the PostgreSQL transaction and treats the exact boundary (`expiresAt <= server time`) as expired.

Administrative status/cancellation operations continue to reject expired sessions rather than allowing a client to revive them.

No background cleanup worker is required for security enforcement.

## One-time use and replay protection

Consumption:

1. reads the enrollment owner;
2. locks and checks the owning administrator;
3. locks the enrollment session row;
4. validates server-side expiration and state;
5. verifies the presented secret;
6. checks the stable installation identity;
7. creates the ManagedDevice;
8. marks the session `COMPLETED`.

Administrator-first locking is used consistently with cancellation to avoid lock-order deadlocks.

All steps occur in one PostgreSQL transaction.

A replay after completion is rejected. Concurrent consumption attempts cannot both complete the same session.

Managed-device stable installation identity remains database-unique, providing a second database-level race protection boundary.

## Administrator ownership and authorization

Admin endpoints derive administrator identity from the authenticated opaque session. No client-supplied `adminId` is accepted as authority.

The Phase 5.4 hardening also locks the administrator row during enrollment creation, cancellation, and consumption. This closes the race where an administrator could be disabled between authentication middleware and a security-sensitive enrollment mutation.

Disabled administrators cannot create or consume enrollment sessions.

Cross-administrator status access remains ownership-scoped and returns the existing generic enrollment-not-found contract.

## Database integrity

Migration:

`migrations/0010_phase_5_4_enrollment_security_hardening.sql`

The migration adds database checks for:

- SHA-256 enrollment secret digest format;
- `verified_at` consistency with `VERIFIED`/`COMPLETED`;
- `completed_at` consistency with `COMPLETED`;
- ManagedDevice association consistency with `COMPLETED`;
- `cancelled_at` consistency with `CANCELLED`.

These constraints prevent partially populated enrollment states from being created through direct database writes.

Existing Phase 2/5.1 uniqueness, foreign-key, state, expiration, and indexing constraints remain intact.

## Rate limiting

The existing enrollment consume limiter remains the protection boundary for unauthenticated pairing verification. It uses the repository's existing `express-rate-limit` architecture and normalized client-IP keys.

The per-session failed-attempt counter provides an independent credential-guessing limit.

For distributed production deployments, the existing process-local limiter must be replaced with a shared trusted store or equivalent edge/API-gateway control.

## Logging

Enrollment security events retain correlation through request and resource identifiers without logging:

- authorization secrets;
- access or refresh tokens;
- passwords;
- full sensitive request bodies;
- managed installation identity values.

Existing enrollment creation, failed verification, and completion/cancellation events remain the audit trail.

## API contract

No Phase 5.2/5.3 endpoint or request/response contract was intentionally changed.

The existing endpoints remain:

- `POST /api/v1/devices/enrollments`
- `GET /api/v1/devices/enrollments`
- `GET /api/v1/devices/enrollments/{enrollmentId}`
- `POST /api/v1/devices/enrollments/{enrollmentId}/cancel`
- `POST /api/v1/devices/enrollments/{enrollmentId}/consume`

The OpenAPI contract remains the source of the external HTTP shape.

## Testing

Phase 5.4 strengthens the PostgreSQL integration suite with:

- disabled-admin creation rejection;
- disabled-admin consumption rejection;
- exact expiration-boundary rejection;
- replay/concurrency coverage already present from Phase 5.1;
- database migration and constraint verification.

The existing unit suite continues to cover state transitions, secret generation, validation, ownership, cancellation, and error mapping.

## Cross-repository contract

No Android repository changes are required by the Phase 5.4 hardening.

The Admin Android client continues to treat enrollment creation/status/cancellation as administrator-authenticated operations.

The Managed Android client continues to use the one-time authorization secret for consumption and must treat expiration, cancellation, failed verification, authorization denial, and already-consumed outcomes as terminal enrollment outcomes.

## Phase boundary

Phase 5.4 does not implement Phase 6 functionality.

No WebSockets, Socket.IO command transport, FCM command delivery, remote commands, remote lock/wipe/reboot, camera/microphone capture, screen sharing, live location, app/website blocking, network filtering, policy enforcement, remote configuration, or advanced dashboard functionality is introduced.
