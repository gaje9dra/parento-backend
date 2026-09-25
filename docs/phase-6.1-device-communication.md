# Phase 6.1 — Device Communication & Secure Command System Foundation

## Scope
This phase adds backend-only communication infrastructure. It does not implement device-control commands.

## Architecture
`Admin → authenticated backend API → command domain → transport abstraction → ManagedDevice`.

Managed-device connectivity is separate from enrollment. A device session has its own identifier, lifecycle timestamps, credential reference, and expiry.

## Device authentication
Device sessions authenticate with a backend-issued opaque credential whose hash is persisted. Credentials are revocable and optionally expiring. Device authentication is separate from administrator authentication.

**Provisioning dependency:** the existing Phase 5 consume contract does not yet return a long-lived communication credential. The managed app must receive/store a dedicated device credential in a future managed-side Phase 6 integration. This phase therefore provides credential persistence and authentication infrastructure without changing the Phase 5 enrollment response.

## Command model
Commands are persisted with device/admin ownership, neutral `FUTURE_COMMAND` type, schema version, bounded JSON payload, expiration, correlation ID, idempotency key, session ID and lifecycle timestamps.

No functional lock, wipe, reboot, camera, microphone, screen, location, app-blocking, website-blocking, network-filtering or arbitrary-execution command exists.

## Lifecycle
`CREATED → QUEUED → DELIVERING → DELIVERED → ACKNOWLEDGED → RUNNING → SUCCEEDED/FAILED`, with `EXPIRED`, `CANCELLED`, and `REJECTED` terminal states.

State changes are validated and performed transactionally with row locking.

## Authorization
Admin command APIs derive the administrator from the existing bearer session. The command service does not accept an admin ID as authority. The repository must additionally verify device ownership before command creation.

## Transport
The command service depends on `CommandDeliveryPort`. The default implementation is intentionally not configured, so Phase 6.1 does not establish a realtime transport or execute commands.

## Security
- bounded payloads
- strict command registry
- server-side expiry
- DB uniqueness for idempotency
- terminal-state protection
- device-session binding
- no credential/payload logging
- revoked/inactive devices cannot create sessions
- session and command identities are independent of hardware identifiers

## Cross-repository dependencies
`parento-managed` will need a secure credential storage and device-session client in its later Phase 6 integration. `parento-admin` will need command creation/status UI only after the backend command APIs are adopted. Neither repository is modified by this phase.
