# Phase 2.1 — Backend Database Foundation

## Repository boundary

This phase modifies only `gaje9dra/parento-backend`.

No code or configuration changes are made to `gaje9dra/parento-admin` or `gaje9dra/parento-managed`.

## Database technology

The backend uses PostgreSQL through the `pg` Node.js client. PostgreSQL was selected because Phase 1 had not established a database ORM and the Phase 2.1 specification prefers a conventional relational PostgreSQL approach.

The implementation intentionally does not add a heavyweight ORM. `pg` provides pooling, parameterized queries, transactions, and a small query boundary suitable for the current foundation.

## Architecture

The intended persistence flow is:

```
API / Controller
      ↓
Service
      ↓
Repository / Data Access
      ↓
PostgreSQL query layer
      ↓
PostgreSQL
```

HTTP controllers do not contain database queries.

`src/repositories/postgres-repository.ts` provides a reusable repository boundary for later business repositories without creating speculative repositories for future entities.

## Database configuration

Database configuration is part of the existing typed environment configuration:

- `DATABASE_URL`
- `DATABASE_POOL_MAX`
- `DATABASE_IDLE_TIMEOUT_MS`
- `DATABASE_CONNECTION_TIMEOUT_MS`
- `DATABASE_SSL`

The URL must use `postgres:` or `postgresql:`.

Production requires `DATABASE_URL`, while development/test may intentionally omit it when the backend is being exercised without persistence.

No production connection string or credential is committed.

## Connection lifecycle

When a database URL is configured:

1. `createDatabase()` creates one process-wide PostgreSQL pool.
2. Server startup calls `database.connect()` before listening.
3. Runtime queries reuse the pool.
4. Transactions acquire a pool client, issue `BEGIN`, execute the service callback, then `COMMIT` or `ROLLBACK`.
5. Graceful server shutdown closes the database pool.

The pool is configured through environment values rather than arbitrary request-level connections.

## Optional database mode

The API foundation can still run without a database URL for development contexts that only need HTTP-layer tests.

In this mode:

- health remains lightweight;
- readiness reports `database: not_configured`;
- database commands fail clearly instead of silently doing nothing.

When a database URL is configured, readiness executes a lightweight `SELECT 1` check and reports database availability.

## Migrations

SQL migrations live in:

`migrations/`

The migration runner maintains:

`schema_migrations`

Each migration is identified by its numeric prefix and filename.

The initial migration is:

`0001_phase_2_1_baseline.sql`

It deliberately creates no business entities. Its purpose is to establish deterministic, version-controlled migration infrastructure without prematurely designing administrators, devices, sessions, policies, commands, locations, restrictions, or audit tables.

Migration operations:

```bash
npm run db:migrate:status
npm run db:migrate
npm run db:reset
```

`db:reset` is development/test-only and explicitly refuses to operate when `NODE_ENV=production`.

Schema changes must be made through committed migration files. Automatic production schema synchronization is not used.

## Transactions

The database boundary exposes:

`database.withTransaction(async (client) => { ... })`

A transaction:

- begins on a pooled client;
- commits only after the callback completes;
- rolls back on callback failure;
- always releases the client.

Future services should use this boundary when multiple writes must succeed or fail atomically. No speculative transaction abstraction is added beyond this current requirement.

## Error handling

Database connectivity failures are represented by a safe application-level error boundary in `src/db/errors.ts`.

Client-facing database failures must not expose:

- SQL statements;
- connection strings;
- database hostnames;
- credentials;
- driver stack traces.

Request IDs remain the correlation mechanism for server-side diagnostics.

## Logging

Database query logging is not enabled globally.

The PostgreSQL pool does not log query parameters or sensitive records by default. Existing Pino redaction continues to protect authorization headers, cookies, tokens, secrets, and related fields.

Development diagnostics should be enabled only deliberately and must not be used to log credentials or sensitive device data.

## Readiness

`GET /api/v1/health` remains lightweight and does not query PostgreSQL.

`GET /api/v1/ready` distinguishes:

- `database: not_configured` — persistence is intentionally not configured;
- `database: available` — configured PostgreSQL responded to `SELECT 1`;
- `database: unavailable` — configured PostgreSQL could not be reached.

A configured-but-unavailable database returns HTTP 503.

No expensive database query is used for readiness.

## Testing

Database integration tests are in:

`tests/database.integration.test.ts`

They cover:

- PostgreSQL connectivity;
- clean migration application;
- migration status;
- deterministic repeated migration execution;
- transaction rollback.

The integration suite is skipped when `DATABASE_URL` is absent, allowing HTTP/configuration unit tests to run without a database.

CI provisions a disposable PostgreSQL 17 service and supplies a dedicated test database. It runs migration status, migrations, unit tests, integration tests, lint, type checking, build, and dependency audit.

## Local development

Configure a local PostgreSQL instance and set:

```env
NODE_ENV=development
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/parento
DATABASE_SSL=false
```

Then:

```bash
npm install
npm run db:migrate:status
npm run db:migrate
npm test
npm run build
```

Use `npm run db:reset` only against a development/test database that can safely be destroyed.

## Production rules

- Database credentials are supplied externally.
- PostgreSQL transport security must be configured appropriately for the deployment.
- Production schema changes are version-controlled migrations.
- No destructive reset is available in production.
- No automatic production schema synchronization is enabled.
- No future business entities are created by Phase 2.1.
