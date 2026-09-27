# Phase 11.4 — Application Management Security & Reliability Hardening

Phase 11.4 hardens the Phase 11.1 backend foundation without changing the public endpoint surface or implementing Android enforcement.

## Security boundary

- Managed-device application endpoints derive device identity only from the authenticated device session.
- Admin application endpoints require authenticated-admin middleware plus device/policy ownership checks.
- Database triggers backstop tenant ownership for assignments, synchronization state, inventory writes, and application-management commands.
- Revoked/inactive devices cannot receive new inventory writes or active policy assignments.
- No application inventory, credentials, APK data, or private application content is written to normal logs.

## Inventory synchronization

Inventory replacement is a full transactional snapshot.

The repository locks the authoritative managed_devices row before checking the latest server receipt time. This prevents two concurrent reports from racing and allows lifecycle changes to serialize with inventory writes.

Older reports are ignored by server receipt time. A revoked or inactive device is rejected before its inventory can be committed.

The server distinguishes:

- observedAt — device-observed inventory time;
- receivedAt — server receipt time;
- current inventory — the latest accepted full snapshot;
- freshness — derived from receipt/device lifecycle state.

## Policy validation and versioning

Policy rules remain limited to:

- ALLOW
- BLOCK

Android package names, rule count, policy size, and policy status are validated by the existing API/service/schema layers.

Policy updates remain optimistic-concurrency controlled by expectedVersion. Versions only advance; stale writes return 409 CONFLICT.

Policy disable/re-enable lifecycle is transactionally safe:

- disabling a policy preserves the historical assignment but clears desired synchronization state;
- re-enabling the policy advances an existing assignment to the current policy version;
- desired state is then restored to the current active policy version.

A disabled policy is never sent as an active enforcement target.

## Desired, reported, and enforcement state

application_policy_sync_state remains the authoritative separation between:

- desired policy ID/version;
- device-reported policy ID/version;
- reported synchronization/enforcement status.

The backend never treats command delivery as successful enforcement.

Reported synchronization updates are serialized on the sync-state row. A report older than the stored last_reported_at is treated as a replay/out-of-order report and does not replace newer state.

Database checks ensure reported/desired policy identities belong to the same administrator as the device. APPLIED additionally has to match the device's current assignment.

## Command integration

Phase 11.4 continues to use the existing Phase 6 command system.

Only these application-management command types are allowed:

- SYNC_APPLICATION_POLICY
- REQUEST_APPLICATION_INVENTORY

Policy-sync command idempotency is scoped to the device, target policy version/removal state, and the caller's correlation ID. This prevents an old completed command for a previously assigned version from suppressing a later explicit synchronization request.

Command payload and ownership checks remain enforced by the existing command service and PostgreSQL trigger.

## Lifecycle and revocation

Device revocation continues to invalidate application-management synchronization state and reject pending application-management commands.

Assignments are only created/updated for active devices. Re-enabling a policy restores the assignment's current policy version without claiming that Android enforcement has already occurred.

## Database migration

Phase 11.4 adds:

- migrations/0019_phase_11_4_application_management_hardening.sql

The migration preserves all previous migration history and adds/replaces only Phase 11.4 trigger functions and validation behavior. It does not reset or destroy existing data.

## Verification coverage

Regression coverage includes:

- migration ordering and repeat application;
- policy disable/re-enable assignment propagation;
- desired-state clearing/restoration;
- synchronization report replay protection;
- application-management database schema/command constraints;
- existing application-management service/domain tests;
- existing repository-wide authentication, device-session, command, migration, and integration tests.

## Explicit non-goals

Phase 11.4 does not implement:

- Android PackageManager blocking;
- Device Owner enforcement;
- Accessibility-based blocking;
- root or hidden-API bypasses;
- arbitrary package installation/removal;
- shell/script execution;
- website/network blocking;
- device lock/wipe;
- Admin Android changes;
- Managed Android changes;
- Phase 12 functionality.

The backend remains the authoritative desired-state and enforcement-reporting foundation for later legitimate Managed Android enforcement.
