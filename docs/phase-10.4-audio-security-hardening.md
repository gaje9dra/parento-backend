# Phase 10.4 — Audio Access Security, Reliability & Transport Hardening

## Scope

Phase 10.4 hardens the existing Phase 10.1 backend audio-access control plane. It does not add microphone capture, audio playback, a media server, or a new realtime/media transport.

Only the backend repository is changed.

## Authorization model

Every live audio session is bound to:

`Admin → ManagedDevice → DeviceConnectionSession → AudioAccessSession`

Admin authorization is derived from the authenticated Admin session and the target ManagedDevice ownership. Managed-device authorization requires an active enrollment, active operational status, and the exact connected device-connection session that created the audio session.

A session ID or device ID alone is not sufficient to acknowledge an audio operation.

## Immutable ownership

For a live session, `managed_device_id`, `admin_id`, and `device_connection_session_id` are immutable after creation.

The database security trigger also verifies that the Admin owns the ManagedDevice and that the bound device-connection session belongs to the same ManagedDevice.

## Lifecycle and expiration

The existing lifecycle remains:

`REQUESTED → AUTHORIZED → STARTING → ACTIVE → STOPPING → STOPPED`

Terminal states are `STOPPED`, `EXPIRED`, `FAILED`, and `REJECTED`.

Database transition validation remains the backstop. Live transitions are rejected when the server-side expiration time has passed, the Admin is disabled, the device is revoked/not active, or the bound device connection is not currently connected and unexpired.

Expiration is therefore server-authoritative and cannot be extended by client clocks or realtime state.

## Revocation and access loss

Existing database triggers continue to invalidate active audio sessions when:

- a device connection becomes disconnected or expired;
- a ManagedDevice is revoked;
- an Admin is disabled.

Admin logout continues to use the existing authentication callback to expire that Admin's active audio sessions.

A reconnect creates a different device-connection identity. An old audio session remains bound to the previous connection and cannot be acknowledged by the new connection.

## Command security

`START_AUDIO_ACCESS` and `STOP_AUDIO_ACCESS` remain the only audio commands.

The database now validates:

- exact `audioSessionId` payload shape;
- exact Admin/device/session ownership;
- deterministic audio idempotency key;
- command/session lifecycle compatibility;
- server-side expiration before execution.

A command for one device/session cannot be replayed against another device/session.

## Concurrency

One live audio session per ManagedDevice remains enforced by the existing partial unique index and transactional advisory locking.

Session transitions use row locking and compare the expected previous state, so concurrent start/stop/expiration/revocation operations cannot silently overwrite each other.

Expiration cleanup uses `FOR UPDATE SKIP LOCKED` and bounded batches.

## Transport boundary

Phase 10.1 does not define a production audio media protocol. Phase 10.4 therefore does not invent WebRTC, RTP, WebSocket media, a media server, or reusable transport credentials.

`transport_state` remains control metadata only. Credential-like fields and media payload fields are rejected at both service and database boundaries.

There is no backend audio archive, raw audio persistence, encoded-media storage, or recording history.

## Realtime isolation

The existing authenticated device SSE command channel is reused only for control commands. Audio media is not broadcast through global realtime events.

Audio commands remain bound to the target ManagedDevice and AudioAccessSession before delivery.

## Privacy-safe logging

Audio data, media packets, reusable transport credentials, and authentication secrets are not stored in audio session metadata or emitted as operational payloads.

The persisted audio records contain lifecycle/control metadata and audit events only.

## Cleanup and retention

Terminal audio sessions can be removed only after the existing retention window through bounded cleanup. Security hardening does not delete audit history merely to hide activity.

## Compatibility

No changes are made to `parento-managed` or `parento-admin`.

The client contract remains:

- Admin creates/reads/stops an audio session through the authenticated backend API.
- Managed device acknowledges start/stop using its authenticated device session.
- The backend derives the exact device-connection identity from authentication; clients do not supply a connection identity in the request body.
- No production audio media transport is claimed or exposed by this phase.

## Verification

Phase 10.4 adds database security guards, connection-binding coverage, transport-metadata privacy tests, and migration/index verification. The repository's standard format, lint, typecheck, unit-test, integration-test, build, and audit workflow remains authoritative.
