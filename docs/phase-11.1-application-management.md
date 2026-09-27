# Phase 11.1 — Application Management & Blocking Foundation

## Scope

Phase 11.1 adds the backend foundation for legitimate Android application management. The backend represents desired state and reported synchronization state; it does not enforce application restrictions on Android.

Actual application enforcement belongs to the Managed Android repository in later Phase 11 work and must use legitimate Android Enterprise/device-management mechanisms.

## Application inventory

Managed devices report a versioned full inventory through:

- POST /api/v1/device/applications/inventory

The authenticated Managed device session is the authority for device identity. A client-supplied device identifier is never accepted as the ownership authority.

Stored metadata is limited to package name, label, version name/code, install state, enabled state when reported, source/category metadata when legitimately available, first/last observed timestamps, and server receipt timestamp.

No APK binaries, application private data, credentials, user files, screenshots, or arbitrary application contents are stored.

Full replacement is transactional. Older received inventories are ignored. Package names are unique per device, duplicate submissions within one inventory are rejected, removed applications disappear from the current inventory, and first/last observation timestamps are preserved across replacement.

Inventory retrieval is Admin-authorized and paginated. Freshness is exposed as FRESH, STALE, VERY_STALE, NEVER_REPORTED, DISCONNECTED, or REVOKED.

## Application policy

An Admin-owned policy contains a stable policy ID, name/description, status ACTIVE or DISABLED, monotonically increasing version, explicit ALLOW/BLOCK rules keyed by Android package name, creator/updater identity, and timestamps.

Package names are validated, not silently rewritten. Duplicate package rules and invalid actions are rejected.

A policy update increments the version. Updates use an expected-version precondition so stale writes fail with 409 CONFLICT.

## Assignment and effective policy

A Managed device has at most one active policy assignment.

Assignment is only permitted when the Admin owns the device, the policy belongs to the same Admin, the device is enrolled and operational, the policy is active, and the assigned version equals the policy's current version.

The effective policy service is deterministic: resolve the device assignment, resolve the owned policy, require the policy to be active, expose canonical rules/version, and expose whether synchronization is required.

The backend does not claim that an Android restriction has been enforced because a command was delivered.

## Desired vs reported state

application_policy_sync_state separates desired policy ID/version, reported policy ID/version, synchronization/enforcement status, last request/report timestamps, and safe error code.

Supported status values: UNKNOWN, PENDING, APPLIED, PARTIALLY_APPLIED, FAILED, STALE.

An APPLIED report is accepted only when it matches the current device assignment, or when the device has no policy and reports a null policy.

## Command integration

Phase 11.1 reuses the existing command infrastructure. It adds only two allowlisted command types:

- SYNC_APPLICATION_POLICY
- REQUEST_APPLICATION_INVENTORY

The command payload is strictly constrained. No shell commands, scripts, executable code, APK execution, arbitrary package installation, or remote terminal functionality is supported.

Existing command identity, device binding, Admin authorization, expiry, idempotency, acknowledgement, result, correlation, and replay protections remain the command boundary.

## Authorization

Admin endpoints reuse the existing Admin authentication and authorization middleware. Service-level ownership checks additionally bind Admin -> ManagedDevice -> ApplicationPolicy.

Managed endpoints reuse the existing authenticated device-session middleware. A device can only submit its own inventory and synchronization state.

Database triggers provide ownership/version backstops for policy assignments and application-management commands.

## Realtime and offline behavior

No second realtime system was introduced. Application-policy changes create existing command-system messages.

When a device is offline, the desired policy remains authoritative and reported enforcement is not upgraded to APPLIED. On reconnection, the device can retrieve the desired policy and report its synchronization state through the existing authenticated device-session architecture.

## Privacy and audit

Application inventory is not emitted into normal request/error logs, metrics labels, or traces.

The phase adds a small application-management event stream for safe audit metadata: policy created/updated/disabled, policy assigned/removed, inventory synchronized, policy synchronization requested, and enforcement status changed.

Events do not contain credentials, tokens, raw inventory bodies, APK data, or private application content.

## Resource limits

Configured defaults:

- maximum inventory items: 500;
- maximum inventory payload: 100 KiB;
- maximum policy rules: 500.

The limits are configurable and bounded by the backend configuration schema.

## API surface

Managed device:

- POST /api/v1/device/applications/inventory
- GET /api/v1/device/application-policy
- POST /api/v1/device/application-policy/status

Admin:

- GET /api/v1/admin/devices/{deviceId}/applications
- GET /api/v1/admin/devices/{deviceId}/applications/{packageName}
- POST /api/v1/admin/devices/{deviceId}/applications/inventory/request
- GET/POST /api/v1/admin/application-policies
- GET/PATCH /api/v1/admin/application-policies/{policyId}
- GET/POST/DELETE /api/v1/admin/devices/{deviceId}/application-policy
- GET /api/v1/admin/devices/{deviceId}/application-policy/status
- POST /api/v1/admin/devices/{deviceId}/application-policy/sync

## Enforcement boundary

This phase does not implement Android application blocking, package installation/uninstallation enforcement, Device Owner enforcement, Accessibility-based blocking, hidden APIs or root controls, arbitrary package execution, website/network blocking, device locking/wiping, Managed Android changes, Admin Android changes, or Phase 12+ functionality.

Backend policy represents desired application-management state. Android enforcement is performed separately by the Managed Android application using legitimate Android management APIs.
