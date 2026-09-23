# Phase 2.4 — Persistence Services, Query Layer & Database Operational Readiness

Repository: gaje9dra/parento-backend only.

## Architecture

API → Validation → Service → Repository → ORM / PostgreSQL

No API route directly accesses ORM/database primitives. Repository interfaces expose domain operations rather than query builders.

## Query contracts

Admin: find by ID, find by email, existence by email, create, update status, update metadata.

Managed device: find by ID, find by stable identifier, list all, list by administrator, create, update status.

Enrollment: find by ID, find by enrollment identifier, list by administrator, list by device, create, update lifecycle status.

## Pagination and ordering

List queries use cursor pagination with default page size 50, maximum 100, deterministic created_at DESC / id DESC ordering, an encoded timestamp+UUID cursor, and one extra row to determine nextCursor.

Unbounded list queries are not exposed by the repository contracts.

## Indexing

Migration 0004 adds composite indexes aligned with managed-device and enrollment list access patterns. It also removes the redundant non-unique stable-identifier index because the existing unique constraint already provides an index for that key.

## Transactions

The database abstraction provides withTransaction() using one PostgreSQL client for BEGIN/COMMIT/ROLLBACK. Migration application uses this boundary so failed migrations are not recorded as applied.

Current Phase 2.4 resource writes are single-resource operations; no network operation is placed inside a database transaction.

## Connection pool

PostgreSQL pooling remains configuration-driven through DATABASE_POOL_MAX, DATABASE_IDLE_TIMEOUT_MS, DATABASE_CONNECTION_TIMEOUT_MS, and DATABASE_SSL. No deployment-specific values are hardcoded.

## Health and readiness

GET /api/v1/health is process-level health.

GET /api/v1/ready requires a configured and reachable PostgreSQL database. Database-unavailable or unconfigured readiness returns HTTP 503 without exposing credentials, connection strings, or raw SQL errors.

## Error handling

PostgreSQL errors are mapped to safe PersistenceError categories: conflict, foreign key, invalid state, database unavailable, and unknown. Raw SQL/PostgreSQL details are not intended for clients.

## Migration process

Recommended deployment sequence: provision PostgreSQL and DATABASE_URL; run npm run db:migrate:status; run npm run db:migrate; verify GET /api/v1/ready; start the application.

npm run db:reset is development/test only and rejects production configuration.

Migrations are numbered, ordered, transactional, and recorded in schema_migrations.

## Testing strategy

CI uses an isolated PostgreSQL 17 service. Coverage includes migrations, repeat migration determinism, transaction rollback, unique constraints, foreign keys, repository state transitions, bounded list behavior, and health/readiness.

## Deferred

Authentication, enrollment APIs, QR pairing, provisioning, WebSockets, FCM, monitoring, telemetry, location, camera, microphone, audio, screen capture/sharing, device control, app blocking, website/network filtering, policy enforcement, and complete audit implementation remain deferred.