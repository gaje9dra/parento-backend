# Phase 9.1 — Backend Screen Sharing Foundation

## Scope

Phase 9.1 adds the backend authorization and lifecycle foundation for screen-sharing sessions. The backend coordinates an authorized session and the existing device command/realtime infrastructure; it does not capture, decode, inspect, record, or persist screen frames.

Android screen capture remains the responsibility of a later managed-device implementation using Android's legitimate MediaProjection APIs and OS consent.

## Session lifecycle

The persisted lifecycle is: REQUESTED → AUTHORIZED → STARTING → ACTIVE → STOPPING → STOPPED

Terminal rejection/failure/expiration paths are also supported:

- REQUESTED → REJECTED | FAILED | EXPIRED
- AUTHORIZED → STOPPING | FAILED | EXPIRED
- STARTING → ACTIVE | STOPPING | FAILED | EXPIRED
- ACTIVE → STOPPING | FAILED | EXPIRED
- STOPPING → STOPPED | FAILED | EXPIRED

Terminal states cannot become active again.

Every session has a server-authoritative expiration. The configured maximum is bounded to 30–3600 seconds and defaults to 900 seconds.

## Authorization

Admin requests authenticate through the existing admin authentication middleware. The service then verifies:

- the authenticated Admin owns the ManagedDevice;
- the ManagedDevice is enrolled and operationally ACTIVE;
- the device has a valid active communication session;
- only the authoritative managed-device identity from the authenticated device session can acknowledge lifecycle changes.

Client-supplied Admin IDs and ownership flags are never trusted.

## API

### Admin

- POST /api/v1/devices/{deviceId}/screen-sessions — creates and authorizes a session, then queues START_SCREEN_SHARE.
- GET /api/v1/screen-sessions/{sessionId} — returns the authenticated Admin's owned session.
- POST /api/v1/screen-sessions/{sessionId}/stop — transitions the session to STOPPING and queues STOP_SCREEN_SHARE.

### Managed device

- POST /api/v1/device/screen-sessions/{sessionId}/started — authenticated device session only; transitions STARTING → ACTIVE.
- POST /api/v1/device/screen-sessions/{sessionId}/stopped — authenticated device session only; acknowledges STOPPING → STOPPED.

The API returns session identifiers, device identifier, lifecycle timestamps, expiration, termination reason, correlation ID, and non-secret transport state. Credentials and private transport secrets are not exposed.

## Existing command/realtime integration

Screen sharing reuses the existing command persistence and SSE device transport. Two structured command types are allowed internally:

- START_SCREEN_SHARE
- STOP_SCREEN_SHARE

Their payload is allowlisted to exactly one UUID field: screenSessionId. The general Admin command endpoint remains restricted to FUTURE_COMMAND, so screen commands cannot be injected through the generic command API.

No second WebSocket, socket registry, or authentication layer was introduced.

## Device disconnect / revocation

Database triggers terminate active screen sessions when:

- the device communication session becomes DISCONNECTED or EXPIRED;
- the ManagedDevice is revoked or unenrolled.

Admin logout expires that Admin's active screen sessions, and disabling an Admin expires their active sessions through a database trigger.

## Persistence

Migration 0014_phase_9_1_screen_sharing.sql adds:

- screen_sharing_sessions
- screen_sharing_session_events
- lifecycle, ownership, expiration, and lookup indexes;
- one-active-session-per-device enforcement;
- command-type constraint extension for screen commands;
- disconnect, device-revocation, and admin-disable termination triggers.

No screen frames, screenshots, recordings, media blobs, or transport credentials are stored.

## Transport boundary

The backend only coordinates authorization, command delivery, lifecycle, expiration, and non-secret session metadata. Actual MediaProjection capture, media encoding/decoding, media transport, and OS consent remain out of scope for Phase 9.1.

## Verification note

Terminated session metadata is cleaned opportunistically when new screen-sharing requests are processed, using the configured retention window. This keeps retention bounded without introducing a separate scheduler in Phase 9.1.

