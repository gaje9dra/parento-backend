# Phase 10.1 — Backend Audio Access Foundation

## Scope

This phase adds the backend foundation for explicitly authorized live audio-access sessions between a managed Android device and an authenticated administrator.

It does **not** implement microphone capture, audio playback, audio media transport, recording, storage, or Android permission handling.

## Authorization model

Admin requests use the existing Admin authentication and authorization middleware. The backend derives the Admin identity from the authenticated bearer session and verifies that the selected ManagedDevice belongs to that Admin.

The ManagedDevice must be actively enrolled, operationally active, and have a currently connected, unexpired device communication session.

Device lifecycle acknowledgements use the existing device-session authentication. A client-provided device identifier is never trusted as the authentication source.

## Lifecycle

`REQUESTED -> AUTHORIZED -> STARTING -> ACTIVE -> STOPPING -> STOPPED`

Terminal security/failure paths are `EXPIRED`, `FAILED`, and `REJECTED`.

Terminal states cannot be resurrected. PostgreSQL enforces the same transition rules used by the application repository.

Every session has a bounded server-side lifetime. Expiration is based on backend time and invalidates future session operations.

Only one non-terminal audio-access session is permitted per ManagedDevice. Application advisory locking and a PostgreSQL partial unique index protect creation against races.

## Commands

The existing allowlisted command system now supports:

- `START_AUDIO_ACCESS`
- `STOP_AUDIO_ACCESS`

Each command is bound to the ManagedDevice, Admin, AudioAccessSession, expected operation, and correlation/idempotency information.

Commands use the existing authenticated device SSE delivery mechanism. No unrestricted command execution was introduced.

## Realtime and transport boundary

The existing realtime infrastructure is used only for authenticated command/signaling delivery.

This phase defines session control metadata but does not implement a media server or custom audio streaming protocol. No audio bytes are persisted or broadcast through generic realtime events.

The `transportState` field is restricted to small allowlisted metadata such as lifecycle state, transport name, and connection identifier.

## Revocation and disable handling

Device disconnect/expiration, device revocation, and Admin disable invalidate active audio-access sessions through database triggers.

Admin logout also expires the Admin's associated audio-access sessions through the existing authentication lifecycle callback.

An already-created session therefore cannot be used as an authorization bypass after the underlying identity/session becomes invalid.

## API

Admin:

- `POST /api/v1/devices/{deviceId}/audio-sessions`
- `GET /api/v1/audio-sessions/{sessionId}`
- `POST /api/v1/audio-sessions/{sessionId}/stop`

Managed device:

- `POST /api/v1/device/audio-sessions/{sessionId}/started`
- `POST /api/v1/device/audio-sessions/{sessionId}/stopped`

All routes follow the existing `/api/v1`, request-ID, validation, error, authentication, and rate-limit conventions.

## Privacy

The database stores session metadata and lifecycle audit events only.

The backend does not store:

- microphone audio
- audio packets
- recordings
- audio files
- audio history
- authentication secrets
- transport credentials
- reusable authorization tokens

Android microphone permission remains a client-side security boundary for a later client phase. The backend does not and cannot bypass Android microphone permission requirements.

## Cross-repository requirements

`parento-managed` will later need to consume the new audio command types and device acknowledgement endpoints and must implement Android microphone permission/capture behavior in a later Phase 10 subphase.

`parento-admin` will later need UI/API integration for requesting, displaying, and stopping authorized audio sessions.

Neither repository is modified by Phase 10.1.
