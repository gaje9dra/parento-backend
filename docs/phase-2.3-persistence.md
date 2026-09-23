# Phase 2.3 — Database Relationships, Integrity & Repository Contracts

## Repository boundary

Only `gaje9dra/parento-backend` is changed.

## Relationship model

```
Admin
  │
  ├── ManagedDevice
  │       │
  │       └── Enrollment
  │
  └── Enrollment
         │
         └── ManagedDevice
```

Every managed device belongs to exactly one administrator. Every enrollment references both an administrator and a managed device, and the composite foreign key requires the enrollment administrator to be the administrator that owns the referenced device.

Deletion uses `ON DELETE RESTRICT` for administrator/device relationships. Important persisted records therefore cannot be silently orphaned or removed through an accidental cascade.

## Integrity invariants

- Administrator email is unique case-insensitively.
- Administrator status is `ACTIVE | DISABLED`.
- Managed-device stable identifier is required and unique.
- Managed-device status values remain `PENDING | ACTIVE | REVOKED`.
- Enrollment status remains `PENDING | COMPLETED | EXPIRED | REVOKED`.
- Enrollment identifiers are unique.
- Enrollment administrator/device relationships are enforced by foreign keys.
- Enrollment expiration must be after creation.
- A completed enrollment must have `completed_at`.
- Managed-device and enrollment lifecycle transitions are validated before updates.
- Timestamps are PostgreSQL `TIMESTAMPTZ` values and are returned as UTC-aware JavaScript `Date` values.
- Repository update operations set `updated_at = NOW()`.

## Repository contracts

### Admin

- `create`
- `findById`
- `findByEmail`
- `updateStatus`
- `updateMetadata`

### ManagedDevice

- `create`
- `findById`
- `findByStableIdentifier`
- `listByAdminId` with bounded cursor pagination
- `updateStatus`

### Enrollment

- `create`
- `findById`
- `findByIdentifier`
- `listByAdminId`
- `listByDeviceId`
- `updateStatus`

ORM/database rows remain internal repository details; public contracts use domain interfaces.

## Transactions and concurrency

The existing PostgreSQL transaction boundary remains the single transaction mechanism. Migration execution is transactional, and the persistence tests verify rollback.

Current Phase 2.3 repositories do not expose a multi-record business operation that requires a new transaction. Where future enrollment/device workflows need multiple writes to succeed atomically, the existing `database.withTransaction()` boundary must be used rather than introducing distributed locking.

Database unique constraints are the primary protection against concurrent duplicate admin emails, device stable identifiers, and enrollment identifiers.

## Error translation

PostgreSQL constraint classes are translated to application-level `PersistenceError` codes:

- `CONFLICT`
- `FOREIGN_KEY`
- `INVALID_STATE`
- `DATABASE_UNAVAILABLE`
- `UNKNOWN`

Raw PostgreSQL errors are retained only as internal causes and are not part of domain/API contracts.

## Query efficiency

The admin-device relationship has an index on `managed_devices.admin_id`. Stable identifiers and enrollment relationships are indexed. Device lists are bounded to a maximum of 100 records per request and use cursor-based ordering by `created_at, id`.

## Migration

Phase 2.3 adds migration `0003_phase_2_3_integrity.sql`.

Migration path:

```
0001 Phase 2.1
      ↓
0002 Phase 2.2
      ↓
0003 Phase 2.3
```

Existing managed-device rows receive their existing UUID `id` as the initial stable identifier. No hardware identifier is introduced.

## Security and deferred scope

Relational integrity does not provide authentication or authorization. The following remain deferred: authentication, enrollment workflow/pairing, QR/enrollment tokens, realtime communication, FCM/WebSockets, monitoring/telemetry, location, camera, microphone, audio, screen capture, device control, app/site blocking, policies, and complete audit events.
