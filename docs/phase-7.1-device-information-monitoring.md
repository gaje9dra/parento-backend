# Phase 7.1 — Device Information & Monitoring Backend Expansion

## Implemented

Phase 7.1 extends the Phase 6.4 backend monitoring foundation without replacing its communication architecture.

Implemented:

- authoritative latest-state monitoring remains one row per ManagedDevice;
- centralized freshness thresholds with FRESH, STALE, VERY_STALE, NEVER_REPORTED, DISCONNECTED, and REVOKED states;
- server receipt time is used for freshness age;
- authenticated telemetry updates device/session last-seen activity;
- bounded telemetry payload validation;
- richer Admin device status response;
- bounded Admin device list with cursor pagination;
- filtering by enrollment state, communication state, management mode, freshness, and permitted device name/stable identifier search;
- deterministic ordering by created timestamp and ManagedDevice ID;
- monitoring-specific database indexes and capacity constraints;
- out-of-order telemetry protection remains based on device collection timestamp;
- no historical telemetry table was added.

## Authoritative state

device_monitoring_snapshots remains the current authoritative monitoring state for each ManagedDevice. An incoming snapshot replaces the current row only when its deviceCollectedAt is not older than the stored observation.

serverReceivedAt records when the backend accepted the observation and is used for freshness calculations. lastSeenAt remains communication activity state and is updated when authenticated monitoring traffic is accepted.

Older or duplicate observations do not roll the authoritative snapshot backward.

## Freshness model

Freshness is centralized in src/domain/device-monitoring-freshness.ts.

Default thresholds:

- FRESH: observation received within 5 minutes;
- STALE: older than 5 minutes and within 30 minutes;
- VERY_STALE: older than 30 minutes;
- NEVER_REPORTED: no monitoring snapshot exists;
- DISCONNECTED: the device has no valid active communication session;
- REVOKED: enrollment or operational state is revoked.

Thresholds are configurable:

- MONITORING_FRESHNESS_FRESH_MS
- MONITORING_FRESHNESS_STALE_MS

STALE and VERY_STALE describe monitoring freshness; communication state remains a separate concept.

## Telemetry validation and authentication

Telemetry is accepted only through the existing authenticated device-session boundary. The authenticated session determines the ManagedDevice identity. A client-supplied managedDeviceId that does not match the authenticated session is rejected.

Schema version, enums, timestamps, numeric ranges, storage/memory relationships, string lengths, and request size are validated.

Revoked or inactive devices cannot submit monitoring data.

No credentials, tokens, network contents, browsing contents, or unrelated identifiers are collected.

## Admin APIs

GET /api/v1/devices

Returns only devices owned by the authenticated administrator.

Supported bounded query parameters:

- limit (1–100);
- cursor;
- enrollmentStatus;
- communicationState;
- managementMode;
- freshness;
- search against permitted device name or stable identifier.

The response contains operational summaries rather than internal database fields.

GET /api/v1/devices/:deviceId/status

Returns the authorized device identity, enrollment/operational state, communication/session status, last-seen information, monitoring freshness/age, and the latest monitoring snapshot.

Ownership is checked against the server-side managed_devices.admin_id relationship.

## Historical telemetry

No historical telemetry storage was added in Phase 7.1. The product currently needs an authoritative latest operational snapshot, not an unlimited telemetry history. This avoids unbounded database growth and unnecessary privacy/storage cost.

A future history feature would require explicit retention, sampling, indexes, bounded time ranges, pagination, and cleanup before implementation.

## Realtime behavior

Phase 6.4 existing realtime transport is preserved. It is device-session SSE for command delivery; there is not yet an Admin-authenticated monitoring event stream.

Phase 7.1 therefore does not introduce a second realtime system or broadcast monitoring data through the existing device transport. Admin clients use the bounded list/detail APIs for monitoring refresh until a dedicated authorized Admin realtime contract is specified.

## Database

Migration 0010_phase_7_1_monitoring_expansion.sql adds:

- monitoring management-mode index;
- ManagedDevice + collection-time index;
- storage capacity consistency constraint;
- memory capacity consistency constraint.

The existing primary key on managed_device_id remains the authoritative latest-state uniqueness constraint.

## Concurrency and recovery

The current-state upsert remains persistence-first and timestamp ordered. Older telemetry cannot overwrite newer state. Device session replacement and revocation continue to use the Phase 6.4 server-side session rules.

Monitoring does not establish direct Admin ↔ ManagedDevice communication.

## Security regression boundary

Phase 1–6 authentication, authorization, enrollment, device-session, command, rate-limit, and error-sanitization architecture is preserved. Phase 7.1 adds monitoring-specific validation and authorization checks rather than a parallel security model.

## Deferred / future

Not implemented:

- historical telemetry retention;
- Admin monitoring realtime stream;
- location;
- camera or microphone;
- screen capture/sharing;
- app or website blocking;
- device lock/wipe;
- advanced policy controls;
- arbitrary shell/code execution;
- credential extraction or hidden surveillance.
