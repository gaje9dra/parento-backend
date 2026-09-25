# Phase 6.1 — Device Communication & Secure Command Foundation

## Scope

Phase 6.1 adds backend-only communication infrastructure. It does not implement lock, wipe, camera, microphone, screen capture, location, application blocking, website blocking, network filtering, arbitrary execution, or any other device-control capability.

## Trust boundaries

Admin App → Backend → Managed Device

The Admin app never connects directly to the Managed app. Device credentials are distinct from administrator credentials.

## Device authentication

Enrollment completion atomically creates a managed-device credential. Only its one-time plaintext value is returned to the enrolling Managed app; the backend stores only a SHA-256 hash.

The device credential establishes a short-lived communication session. Session tokens are opaque, randomly generated, hashed at rest, server-expiring, and invalidated when the device is revoked or the session is disconnected/expired.

No hardware identifiers are used as session identity.

## Connection model

Enrollment and connectivity are separate concerns. A device can be enrolled while offline.

Connection states: CONNECTING, CONNECTED, DISCONNECTED, STALE, EXPIRED.

The session stores creation, connection, activity, disconnection, and expiration timestamps.

## Command model

The backend stores a stable command ID, owning administrator, target device, type, version, payload, correlation ID, idempotency key, lifecycle timestamps, expiration, failure/result fields, and an append-only command-event trail.

Only FUTURE_COMMAND version 1 exists in this phase. Its payload must be an empty JSON object. This is an infrastructure placeholder, not an executable device command.

## Command lifecycle

CREATED → QUEUED → DELIVERING → DELIVERED → ACKNOWLEDGED → RUNNING → SUCCEEDED/FAILED

Cancellation is available only for non-terminal commands where the transition is valid. Expiration is server-authoritative. Terminal commands cannot become active again.

State changes use PostgreSQL transactions and row locking. Command events record the actor type and safe correlation information.

## Idempotency and replay protection

Command creation accepts an optional idempotency key unique to an administrator/device pair. Repeating the same key returns the existing command rather than creating another command.

Acknowledgement, start, completion, cancellation, and expiration are state-checked on the server. Replayed or out-of-order transitions are rejected.

## Authorization

Every administrator command is authorized from the authenticated administrator principal and the persisted managed_devices.admin_id relationship. Client-supplied adminId is never trusted.

Every device acknowledgement/result is authorized from the authenticated device session and the persisted command target device. A device cannot report on another device's command.

## Transport boundary

The command domain depends on a CommandDeliveryPort. The transport adapter is intentionally not implemented in Phase 6.1. This prevents command lifecycle logic from becoming coupled to WebSocket/Socket.IO or another transport.

## Security logging

Security-relevant events use safe identifiers and request/correlation IDs. Device credentials, administrator tokens, passwords, and command payloads are not logged.

## Future cross-repository contract

parento-managed will later need to securely retain the one-time device credential, establish POST /api/v1/device/sessions, retain only the short-lived session token, and use the device-session endpoints for command lifecycle events.

parento-admin will later need to create commands through the administrator-authenticated endpoint, send stable idempotency keys for retries, and display lifecycle status without treating delivery as execution.

No changes were made to either repository in Phase 6.1.

## Verification status

Repository verification is performed by the existing GitHub verification workflow; the branch must pass formatting, lint, type checking, migrations, tests, build, and dependency audit before merge.
