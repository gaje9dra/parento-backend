# Phase 3.4 — Admin Account Management & Authentication Operations

## Scope

Phase 3.4 modifies only `gaje9dra/parento-backend`. It builds on the Phase 3.1–3.3 administrator authentication/session architecture.

No managed-device, enrollment, pairing, realtime, monitoring, policy, surveillance, or device-control functionality is introduced.

## Current-admin identity

`GET /api/v1/auth/admin/me` remains bound to the authenticated server-side identity. It does not accept an `adminId` selector, and the authentication middleware resolves the administrator from the validated opaque access credential.

The response is an API DTO rather than a database entity and exposes only administrator identity/status information already required by the current client contract. It does not expose password hashes, credentials, session secrets, or internal security metadata.

## Account status

Administrator lifecycle states remain:

- `ACTIVE`
- `DISABLED`

Login, access-token validation, and refresh all re-check the persisted status. A disabled administrator therefore cannot continue using an existing session.

There is intentionally no public account-status mutation endpoint in this phase. The repository contains internal persistence primitives for status changes, but no client-accessible route grants an arbitrary authenticated administrator permission to disable another administrator.

Self-disable behavior is therefore not exposed; there is no hidden bypass.

## Account identifiers and profile persistence

The database remains authoritative for case-insensitive uniqueness through the existing unique index on `LOWER(email)`.

New administrator records created through `AdminPersistenceService` now use deterministic normalization:

- trim leading/trailing whitespace
- lowercase the email
- reject empty, malformed, or over-254-character identifiers

Existing stored identifiers are not rewritten.

Display names are normalized at the persistence-service boundary by trimming whitespace, converting an empty value to `null`, and limiting the value to 100 characters.

The PostgreSQL repository continues to rely on the database uniqueness constraint; it does not silently rewrite existing identifiers.

## Password security boundary

The established scrypt password hashing and verification implementation remains unchanged.

The backend does not return or log password hashes, passwords, access credentials, refresh credentials, authorization headers, or session secrets.

No public password-change endpoint is introduced because credential-change functionality is not part of the current Phase 3 contract. The existing password-hash persistence primitive remains internal and is not exposed as a client-controlled operation.

## Authorization boundary

Protected authentication routes continue to require:

1. validated opaque access credential;
2. currently `ACTIVE` administrator status;
3. centralized authentication/authorization middleware.

No endpoint accepts a client-supplied administrator ID as the source of caller identity.

Because a role hierarchy/multi-admin management policy is not established in the current product contract, Phase 3.4 does not invent an unrestricted admin-management endpoint or RBAC system.

## Validation and error handling

Account identifiers and profile metadata are validated before persistence. Database uniqueness remains authoritative for concurrent duplicate creation, and PostgreSQL errors are mapped to the existing stable persistence error categories.

Authentication errors retain the generic contract required for account-enumeration protection. Internal SQL/ORM details are not returned to clients.

## Transactions and concurrency

No new multi-step public account-management mutation is exposed in this phase, so no speculative locking or transaction protocol is introduced. Existing database transactions and unique constraints remain authoritative for persistence operations.

Session invalidation after status changes remains governed by the Phase 3.3 server-side session architecture. Status changes immediately stop authentication because each access-token validation and refresh re-reads the administrator status.

## Security logging

Existing structured login, authentication-failure, authorization-failure, and logout events remain in place. The logger redacts credential-bearing fields centrally.

No full audit-log system is introduced in Phase 3.4.

## API documentation

The OpenAPI contract continues to document only implemented routes. The current-admin contract remains `GET /api/v1/auth/admin/me`; no deferred password/status-management endpoints are documented as public APIs.

## Database and migrations

No schema migration is required. Phase 2 already provides:

- case-insensitive unique administrator email enforcement
- `ACTIVE`/`DISABLED` status constraints
- creation/update timestamps
- password credential storage added by Phase 3.1
- server-side session persistence added by Phase 3.1 and hardened by Phase 3.3

The Phase 3.4 normalization is a service-boundary change for newly created records and does not rewrite existing database rows.

## Testing

Phase 3.4 verification covers:

- current-admin authentication and sensitive-field exclusion through the existing API tests
- disabled-account authentication/session rejection
- case-insensitive database uniqueness
- deterministic normalization for newly created administrator identifiers
- display-name validation and normalization
- malformed identifier rejection
- existing Phase 3 session rotation/revocation regression coverage

## Known limitations

- Password changes are deferred until they are explicitly part of the Phase 3 client/product contract.
- Multi-admin account management and role-based authorization are deferred until an explicit authorization model exists.
- Existing administrator email values are not rewritten; normalization applies to newly created/queried identifiers only.

## Cross-repository contract

No change is required in `gaje9dra/parento-admin` for the Phase 3.4 backend changes described here. The current-admin endpoint contract remains compatible with the existing Admin Android authentication/session implementation.

`gaje9dra/parento-admin` and `gaje9dra/parento-managed` are not modified.
