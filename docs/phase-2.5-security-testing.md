# Phase 2.5 — Database Security, Testing & Phase 2 Completion

Phase 2.5 is the final persistence hardening pass for `gaje9dra/parento-backend`. It does not introduce authentication or device-management workflows.

## Final architecture

```
API
 ↓
Validation
 ↓
Service
 ↓
Repository
 ↓
ORM / PostgreSQL driver
 ↓
PostgreSQL
```

The HTTP layer does not access PostgreSQL directly. Persistence services depend on repository contracts, and PostgreSQL implementations remain isolated under `src/repositories`.

## Database model

### Admin

- UUID primary key
- case-insensitive unique email
- optional display name
- `ACTIVE` / `DISABLED` status
- UTC `created_at` / `updated_at`

### ManagedDevice

- UUID primary key
- stable device identifier with a database uniqueness constraint
- required administrator relationship
- name and platform
- `PENDING` / `ACTIVE` / `REVOKED` lifecycle values
- UTC timestamps and optional `last_seen_at`

### Enrollment

- UUID primary key
- unique enrollment identifier
- administrator and device relationships
- composite administrator/device foreign-key integrity
- `PENDING` / `COMPLETED` / `EXPIRED` / `REVOKED`
- expiration and optional completion timestamps
- UTC `created_at` / `updated_at`

Deletion uses explicit `RESTRICT` semantics for administrator/device relationships so historical persistence records are not silently removed.

## Migration safety

Migrations remain append-only and are never squashed by Phase 2.5.

The migration runner now validates the recorded migration history before applying new migrations:

- unknown migration IDs fail closed
- migration name mismatches fail closed
- duplicate migration IDs in repository files fail closed
- each migration and its `schema_migrations` record are committed atomically

The integration suite verifies both clean installation and upgrading a Phase 2.3 database through the Phase 2.4 migration.

## Query safety

Repository list operations use deterministic cursor pagination ordered by:

`created_at DESC, id DESC`

Page size is bounded to a maximum of 100. Query parameters are bound rather than interpolated. Repository projections select only the persistence fields required by the domain models.

## Persistence error handling

PostgreSQL driver errors are translated centrally into stable persistence-domain errors. Client-facing layers therefore do not need to expose SQLSTATE values, SQL text, PostgreSQL messages, connection details, or driver implementation details.

Mapped categories include:

- `CONFLICT`
- `FOREIGN_KEY`
- `INVALID_STATE`
- `DATABASE_UNAVAILABLE`
- `UNKNOWN`

The original driver error is retained only as a non-serialized error cause.

## Security and configuration

- PostgreSQL credentials are supplied through `DATABASE_URL`.
- No real credentials belong in `.env.example` or source control.
- Production requires a database URL.
- Database connection pooling is configuration-driven.
- Production logs redact credentials, authorization values, cookies, tokens, passwords, secrets, API keys, and database URL fields.
- API error responses remain sanitized.
- Database readiness performs an actual PostgreSQL availability check.
- Production database reset is explicitly disabled.

## Testing and CI

The isolated PostgreSQL integration suite covers:

- connection readiness
- clean migration installation
- deterministic repeated migration execution
- migration upgrade from Phase 2.3 to Phase 2.4
- schema constraints and query indexes
- transaction rollback
- repository/domain persistence behavior
- duplicate and foreign-key failures
- lifecycle validation
- persistence error mapping

CI provisions PostgreSQL 17 and runs formatting, linting, type checking, migration status/application, tests, build, and the configured dependency audit.

## Phase 3 boundary

Phase 2.5 does not implement:

- authentication or password/OAuth/JWT/session functionality
- enrollment/pairing/provisioning workflows
- realtime communication
- device monitoring or telemetry
- location, camera, microphone, audio, or screen capture/sharing
- device lock/reboot/wipe/kiosk controls
- application or website blocking
- policy synchronization/enforcement
- notifications
- complete audit-event functionality

These remain deferred to later phases and must use authorized platform mechanisms.
