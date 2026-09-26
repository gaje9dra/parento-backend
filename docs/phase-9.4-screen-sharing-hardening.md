# Phase 9.4 — Backend Screen Sharing Security, Reliability & Transport Hardening

## Repository

`gaje9dra/parento-backend`

## Findings and implemented hardening

### Authorization

Screen-session creation remains bound to the authenticated Admin, an owned ManagedDevice, and a currently valid device communication session. Session lookup for Admin operations remains ownership-scoped.

Managed-device lifecycle acknowledgements use the authenticated device-session identity; the request cannot supply a different device identity.

### Session state machine

The application state machine remains:

`REQUESTED -> AUTHORIZED -> STARTING -> ACTIVE -> STOPPING -> STOPPED`

with terminal failure/expiration/rejection paths.

Phase 9.4 adds a PostgreSQL state-transition trigger as a second enforcement boundary. Direct SQL performed by device/admin revocation and connection-loss triggers can no longer bypass the lifecycle rules.

Connection loss/revocation now terminates through `EXPIRED`, not `STOPPED`. `STOPPED` remains the normal `STOPPING -> STOPPED` acknowledgement.

### Concurrency

Existing per-device PostgreSQL advisory transaction locking plus the partial unique active-session index remain the authoritative one-active-session protection.

The service now treats a repeated request with the same Admin/device correlation identifier as an idempotent retry rather than creating another session. A different request against an existing active/starting session still receives a conflict.

### Commands

Screen-sharing commands are bound server-side to:

- authenticated Admin;
- ManagedDevice;
- ScreenSession;
- current ScreenSession lifecycle state.

A START command is accepted only from `AUTHORIZED`. A STOP command is accepted only from an active stopping-capable state.

The existing deterministic idempotency key remains:

`screen-session:{screenSessionId}:{START|STOP}_SCREEN_SHARE`

Arbitrary command payloads remain rejected.

### Replay protection

A START command cannot be created against an ACTIVE/terminal session. Device acknowledgements require the authenticated device session to be connected and the screen session to belong to that device.

### Realtime

The backend remains signaling/command delivery infrastructure only. The existing authenticated device SSE transport is reused. No second realtime system or Admin screen-content channel was introduced.

### Transport boundary

Phase 9.1 did not establish a media-frame transport. Phase 9.4 therefore does not invent one.

The backend stores only allowlisted transport metadata and validates lifecycle state values. No screen pixels, frames, screenshots, recordings, or media payloads are persisted.

### Expiration and revocation

Expiration remains server-authoritative.

Device communication disconnect/expiration, ManagedDevice revocation, and Admin disable/logout terminate active screen sessions through the existing database lifecycle triggers. Those transitions are now validated by the database state machine and recorded in the screen-session audit table.

### Audit events

All screen-session status changes are now captured by one PostgreSQL transition-audit trigger, including security-triggered transitions. Repository transition code no longer inserts duplicate lifecycle events.

No screen content or transport secrets are recorded.

### Database

Migration `0015_phase_9_4_screen_sharing_hardening.sql` adds:

- database-enforced lifecycle transition validation;
- centralized transition audit recording;
- hardened disconnect/revocation/admin-disable termination behavior;
- expired-session cleanup index.

The existing one-active-session partial unique index and expiry index remain in place.

### Rate limits

Existing screen-sharing rate limiting is preserved and continues to use the existing application rate-limit configuration. No separate rate-limit system was introduced.

### API contract

The existing `/api/v1` routes are preserved. OpenAPI documentation now includes the Phase 9 screen-sharing endpoints and relevant error codes.

### Failure recovery

If command creation fails after session creation, the service attempts a safe terminal `FAILED` transition. If a concurrent state change occurs, the database state remains authoritative.

Repeated STOP operations after terminal state are now idempotent at the service boundary and return the already-terminal session.

## Tests

Added coverage for:

- repeated screen-session request idempotency;
- repeated terminal STOP behavior;
- stale device-session rejection;
- invalid transport lifecycle metadata;
- screen-command device/session binding;
- replayed START rejection;
- Phase 9.4 migration status.

## Client compatibility

No client repository was modified.

The Admin and Managed Android repositories must consume the existing backend screen-session lifecycle/API contract. No client-side fixes were made in this phase.

## Out of scope

No camera, microphone, audio streaming, arbitrary execution, shell access, permission bypass, hidden API, covert capture, recording storage, iOS support, or Phase 9.5+/10 functionality was implemented.

## Verification

The repository's standard verification workflow is retained unchanged after formatting checks.

## Git safety

Only `gaje9dra/parento-backend` is changed by this phase. No changes were made to `parento-managed` or `parento-admin`.
