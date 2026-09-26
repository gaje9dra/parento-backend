# Phase 11.1 — Application Management & Blocking Foundation

This phase adds the backend-side application-management contract for enrolled Android managed devices.

## Stored state

- Current application inventory metadata per managed device.
- Android package-name identifiers.
- Admin-owned application policies with explicit ALLOW/BLOCK rules.
- One policy assignment per managed device.
- Policy versions and deterministic effective-policy lookup.
- Desired versus reported application-policy state.

Inventory full synchronization is transactional. Device observation time is retained separately from server receipt time, which is authoritative for freshness.

## API

Managed device:
- POST /api/v1/device/applications/inventory
- POST /api/v1/device/applications/enforcement-status

Admin:
- GET /api/v1/devices/{deviceId}/applications
- GET /api/v1/devices/{deviceId}/applications/{packageName}
- POST /api/v1/devices/{deviceId}/applications/inventory-request
- GET/POST /api/v1/application-policies
- GET/PATCH /api/v1/application-policies/{policyId}
- POST /api/v1/application-policies/{policyId}/disable
- PUT/DELETE /api/v1/devices/{deviceId}/application-policy
- GET /api/v1/devices/{deviceId}/application-policy/effective
- GET /api/v1/devices/{deviceId}/application-policy/enforcement

## Security boundary

Managed-device identity is derived only from the authenticated device session. Admin access is checked against the owning admin of the managed device.

Inventory and policy payloads use explicit validation and bounded counts/payloads. Application inventory is not placed into logs or metrics.

## Command integration

The existing Phase 6 command infrastructure is reused. The only new command types are:

- SYNC_APPLICATION_POLICY
- REQUEST_APPLICATION_INVENTORY

Commands are structured objects only. No shell, arbitrary scripts/code, APK execution, unrestricted package installation, remote terminal, or arbitrary package execution is supported.

## Enforcement boundary

The backend represents desired policy, reported device state, and the comparison between them. Command delivery is not treated as successful enforcement.

Android application blocking, installation/uninstallation enforcement, Device Owner enforcement, Accessibility controls, root controls, hidden APIs, network/website blocking, device locking/wiping, and Phase 12+ work are explicitly outside this phase.
