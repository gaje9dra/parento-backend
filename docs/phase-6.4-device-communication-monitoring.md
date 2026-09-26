# Phase 6.4 — Backend Device Communication, Monitoring & Realtime Integration

## Scope

This phase is backend-only and builds on the existing Phase 6.1 device credential, session, and command lifecycle. It adds:

- authenticated device session liveness metadata;
- a single-active-session policy per ManagedDevice;
- an in-process connection registry;
- an authenticated Server-Sent Events (SSE) command-delivery transport;
- command delivery integration without bypassing command persistence;
- validated Phase 6.3 monitoring ingestion;
- latest-state monitoring persistence with server receipt time;
- an admin-authorized device status API.

No device-control, surveillance, sensor, lock/wipe, policy-enforcement, or arbitrary execution feature is introduced.

## Device authentication and ownership

Device credentials remain separate from administrator credentials and are hashed at rest. A communication session is created only after the credential, enrollment state, and ManagedDevice operational state are validated.

For device-session operations, the effective ManagedDevice identity is derived from the authenticated session. Monitoring payloads containing another ManagedDevice ID are rejected.

Enrollment is not used as proof of an active connection.

## Session lifecycle

The existing Phase 6.1 lifecycle is preserved:

CONNECTING → CONNECTED → DISCONNECTED / STALE / EXPIRED

Phase 6.4 records last_seen_at and revoked_at plus bounded connection metadata. A unique partial index enforces at most one active session for a ManagedDevice. Session creation expires an existing active session transactionally before inserting the replacement.

Session expiration is server-authoritative. Device revocation expires active sessions and marks them revoked.

## Realtime transport

The realtime adapter uses SSE because the managed client already has an HTTPS communication boundary and no realtime library was previously established.

Architecture:

CommandService
↓
CommandDeliveryService
↓
CommandDeliveryPort
↓
SseDeviceTransport
↓
InMemoryDeviceConnectionRegistry
↓
Managed Device

The command domain is not coupled to Express or SSE. The registry is deliberately an abstraction suitable for later distributed replacement; no distributed infrastructure is added in this phase.

The stream is authenticated with the short-lived device session token before it is opened. Keepalive comments prevent idle intermediaries from closing a healthy stream.

REALTIME_ENABLED remains opt-in. Deployments must explicitly enable the realtime transport.

## Command delivery

Command creation continues to persist CREATED → QUEUED first. The delivery service then checks for a connected authenticated session.

For an online device:

QUEUED → DELIVERING → DELIVERED

The actual device acknowledgement, start, and result endpoints remain authoritative for:

DELIVERED → ACKNOWLEDGED → RUNNING → SUCCEEDED / FAILED

For an offline device, the command remains queued until a valid connection exists. Expired commands are never delivered.

Concurrent delivery attempts are serialized by the existing command state transition transaction and row locking. Duplicate acknowledgements or out-of-order messages cannot move a command backward or corrupt terminal state.

## Monitoring contract

The device sends schema version 1 containing only the Phase 6.3 operational metrics:

- ManagedDevice ID;
- Android version and API level;
- Parento application version and version code;
- management mode;
- battery percentage, charging state, and battery status;
- network state;
- accessible storage total/available/used;
- runtime memory total/available/low-memory state;
- device collection timestamp;
- known initialization and communication timestamps;
- monitoring update timestamp.

The backend validates types, ranges, enums, timestamps, relationships between totals/available/used values, and schema version.

managedDeviceId is compared with the authenticated session identity and is never trusted on its own.

## Monitoring freshness and retention

The latest snapshot is stored in device_monitoring_snapshots, keyed by ManagedDevice ID. It is replaced only when the incoming device collection timestamp is at least as new as the stored snapshot.

Three timestamps are kept conceptually distinct:

- deviceCollectedAt;
- serverReceivedAt;
- lastSeenAt from communication activity.

The admin status API reports FRESH, STALE, or UNKNOWN monitoring freshness. Connection status derives STALE when an otherwise connected session has not been seen for more than two minutes. No unlimited monitoring history is created.

## APIs

Device-authenticated:

- GET /api/v1/device/stream — authenticated SSE command stream.
- POST /api/v1/device/monitoring — validated monitoring synchronization.
- Existing Phase 6.1 session and command acknowledgement/result endpoints remain unchanged.

Admin-authenticated:

- GET /api/v1/devices/:deviceId/status — authorized device connection state, last-seen information, and latest monitoring snapshot.

Admin identity is derived from the authenticated administrator session, and ownership is checked against managed_devices.admin_id.

## Security controls

- Device and admin authentication remain separate.
- Revoked/disabled devices cannot establish or retain privileged communication.
- Session tokens are opaque and never persisted in plaintext.
- Monitoring input is treated as untrusted.
- Request body limits and rate limiting remain enabled.
- Client errors do not expose database errors, credentials, tokens, or stack traces.
- Security-relevant lifecycle events remain represented by existing safe request/correlation logging.
- No sensitive monitoring or surveillance data is accepted.

## Cross-repository dependency

parento-managed still needs a later client integration to call POST /api/v1/device/monitoring and consume GET /api/v1/device/stream if realtime command delivery is enabled.

That repository is intentionally not modified by Phase 6.4. Until that client integration exists, the backend transport can be exercised independently, but the current managed client remains on its Phase 6.2 HTTPS boundary.

## Deferred features

The following remain outside Phase 6.4:

- location/GPS;
- camera/microphone/audio;
- screen capture or streaming;
- app/website blocking;
- network filtering;
- remote lock/wipe;
- device restrictions and policy enforcement;
- gallery/files/media access;
- contacts/SMS/call logs;
- browser history;
- arbitrary code, shell, or script execution.
