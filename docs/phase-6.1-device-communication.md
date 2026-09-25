# Phase 6.1 — Device Communication & Secure Command System Foundation

## Architecture
Admin authentication terminates at the backend. Managed-device communication uses a separate opaque device credential and session. Commands are persisted in the backend and delivered through a transport port; the default transport is deliberately not configured.

## Device sessions
Enrollment and connectivity are separate. A device session records the managed-device identity, credential reference, connection state, timestamps and expiry. Revoked/expired credentials and non-active devices are rejected. Session IDs are server-generated UUIDs; no hardware identifiers are used.

## Commands
The Phase 6.1 registry contains only the neutral FUTURE_COMMAND type. Commands have a versioned payload, bounded size, server-authoritative expiry, ownership, correlation ID and optional idempotency key. The lifecycle is CREATED to QUEUED to DELIVERING to DELIVERED to ACKNOWLEDGED to RUNNING to SUCCEEDED or FAILED, with EXPIRED, CANCELLED and REJECTED terminal states.

State transitions are row-locked and recorded in command_events. Terminal commands cannot be reactivated.

## Authorization and replay protection
Command creation derives the admin from the authenticated session and verifies the target device belongs to that admin and is active. The database also enforces idempotency uniqueness. Device acknowledgements are bound to the authenticated communication session and server-side command state.

## Transport boundary
CommandDeliveryPort isolates command lifecycle logic from WebSocket, Socket.IO, FCM or other transports. No realtime transport is implemented in 6.1.

## Credential provisioning dependency
This phase stores and validates dedicated device credentials but does not retrofit the Phase 5 enrollment response. parento-managed will need a later Phase 6 client contract to receive and store a dedicated credential and open sessions. parento-admin will need later command UI integration.

## Scope
No lock, wipe, reboot, camera, microphone, screen, location, app blocking, website blocking, network filtering, arbitrary code execution, or covert capability is implemented.
