# Parento Backend

Backend/API/database/realtime foundation for Parento.

## Repository boundary

This phase modifies only:

- gaje9dra/parento-backend

The companion Android repositories are intentionally untouched:

- gaje9dra/parento-admin
- gaje9dra/parento-managed

## Phase 1.4 — Backend API Foundation, Health Endpoints & Request Pipeline

Phase 1.4 establishes the HTTP request pipeline around the architecture from Phases 1.1–1.3. No business features are introduced.

### API base path

The configured API base path defaults to:

```
/api/v1
```

It is controlled by API_BASE_PATH, validated as a versioned /api/vN path, and mounted centrally so future route groups can be added without duplicating the prefix.

### Implemented endpoints

```
GET  /api/v1/health
GET  /api/v1/ready
```

HEAD is supported by Express for the GET health route. CORS preflight uses OPTIONS when an allowed Origin is supplied.

Unknown routes return a JSON 404 NOT_FOUND response. Known health/readiness routes return 405 METHOD_NOT_ALLOWED for unsupported methods.

No authentication, enrollment, device, policy, realtime, or surveillance endpoints are implemented.

### Request lifecycle

The current lifecycle is:

```
Incoming request
      ↓
Request ID / correlation context
      ↓
HTTP security headers
      ↓
CORS
      ↓
JSON body parsing with configured limit
      ↓
Request lifecycle logging
      ↓
Versioned API router
      ↓
Endpoint/controller
      ↓
Centralized error handling
```

Future request validation middleware remains available as an architectural boundary for resource-specific schemas. No speculative business schemas are added here.

### Request IDs

Every request receives an X-Request-Id response header and a requestId response field when a JSON API response is returned.

A syntactically safe incoming X-Request-Id may be reused for correlation. Otherwise the backend generates a UUID using the runtime cryptographic random UUID facility. Request IDs are tracing identifiers only and are not authentication credentials or authorization decisions.

### Success response contract

Successful JSON API responses use:

```json
{
  "data": {},
  "requestId": "..."
}
```

Health and readiness use the same envelope:

```json
{
  "data": {
    "status": "ok",
    "service": "parento-backend",
    "version": "1"
  },
  "requestId": "..."
}
```

### Error response contract

Client-facing errors use:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Route not found."
  },
  "requestId": "..."
}
```

Validation metadata may be included for non-server errors when a future endpoint supplies a schema.

Production responses do not expose stack traces, SQL errors, filesystem paths, environment variables, credentials, tokens, or internal service details.

### HTTP status conventions

The backend reserves these conventions:

| Status | Convention                                                           |
| ------ | -------------------------------------------------------------------- |
| 200    | Successful request                                                   |
| 201    | Resource created                                                     |
| 202    | Request accepted for asynchronous processing                         |
| 204    | Successful response with no body, including accepted CORS preflight  |
| 400    | Malformed or invalid request                                         |
| 401    | Authentication required; reserved for future authentication          |
| 403    | Authorization denied or CORS origin rejected                         |
| 404    | Route/resource not found                                             |
| 405    | HTTP method not allowed                                              |
| 409    | Resource conflict                                                    |
| 413    | Request body exceeds configured limit                                |
| 422    | Semantically invalid entity; reserved for future resource validation |
| 429    | Rate limited; reserved for future rate-limit enforcement             |
| 500    | Unexpected internal server error                                     |
| 503    | Service unavailable; reserved for future dependency readiness        |

Only the operational behavior required by Phase 1.4 is implemented.

### CORS

CORS uses the Phase 1.3 configuration. Development may use configured origins and wildcard development configuration where explicitly selected. Production requires at least one explicit origin and rejects *.

No final admin or managed-device frontend origin is invented.

### Request logging

Pino HTTP lifecycle logging records the request method, path, response status, request ID, and response duration. Authorization headers and cookies are redacted, and request bodies are not logged by default.

Application error logs include an error category/status and correlation ID without placing the error stack into client responses.

### Request body and content type

JSON parsing uses the configured REQUEST_BODY_LIMIT and malformed JSON is converted into the standard INVALID_REQUEST response.

Oversized request bodies return 413 REQUEST_TOO_LARGE.

No unrestricted media upload path is introduced.

### Graceful shutdown

src/server.ts handles SIGINT and SIGTERM, stops accepting new requests through server.close(), waits for active connections handled by Node's HTTP server close semantics, then exits. Shutdown failures set a non-zero exit code.

The implementation does not add distributed shutdown coordination or speculative database/realtime cleanup.

### Security baseline

The request pipeline retains:

- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: no-referrer
- restrictive Permissions-Policy
- explicit CORS
- request-size limits
- cleartext/HTTPS assumptions from Phase 1.3 configuration
- centralized error sanitization
- request correlation
- logging redaction

Authentication, authorization, JWT issuance, refresh tokens, enrollment, device control, surveillance, and security bypasses remain out of scope.

## Phase 1.3 — Backend Configuration, Environment & Operational Baseline

Phase 1.3 adds centralized typed environment configuration, startup validation, development/test/production separation, logging redaction, explicit CORS configuration, HTTP security headers, request-body limits, and health/readiness boundaries.

### Local setup

1. Run \`npm install\`.
2. Copy \`.env.example\` to \`.env\` for local development.
3. Set local environment values as needed.
4. Run \`npm run dev\`.
5. Run \`npm test\`, \`npm run typecheck\`, \`npm run lint\`, and \`npm run build\`.
6. Use \`npm run format:check\` to verify formatting.

### Configuration categories

Configuration is centralized in \`src/config/env.ts\` and exposed as typed categories: app, server, database, logging, cors, security, rateLimit, realtime, and externalServices. Application code should consume this configuration instead of scattering \`process.env\` access.

Production explicitly requires \`DATABASE_URL\`, \`CORS_ORIGINS\`, \`JWT_ISSUER\`, and \`JWT_AUDIENCE\`. These JWT values are configuration boundaries only; authentication and token issuance are not implemented.

## Testing

Phase 1.4 adds API tests for:

- standardized health response
- readiness response
- unknown-route 404 behavior
- unsupported-method 405 behavior
- generated and supplied request IDs
- malformed JSON
- request-size enforcement
- configured CORS
- security headers and response-level secret non-disclosure

Existing configuration, validation, and error-contract tests remain part of the suite.

## Documentation

\`openapi.yaml\` documents the implemented operational endpoints and shared success/error contracts. It does not pretend future Parento resources are implemented.

## Cross-repository requirements

No code changes are required in:

- \`gaje9dra/parento-admin\`
- \`gaje9dra/parento-managed\`

Future phases will integrate those repositories against the documented \`/api/v1\` HTTP contracts. Neither repository was modified by Phase 1.4.

## Development commands

```
npm install
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
npm run format
npm run format:check
```

## Phase status

Phase 1.4 establishes the HTTP/API request pipeline and operational endpoints only. It does not implement admin login, OAuth, enrollment, QR pairing, device credentials, location, streaming, application/website blocking, device locking, remote commands, push notifications, or other future business functionality.

## Phase 1.5 — Backend Security Baseline, Testing Infrastructure & Phase 1 Completion

Phase 1.5 hardens the existing Phase 1 backend foundation without rewriting its architecture or introducing business functionality.

### Security hardening

- Explicit CORS origins are validated as HTTP(S) origins.
- Production rejects wildcard CORS.
- CORS credentials cannot be combined with a wildcard origin.
- CORS preflight advertises only the currently supported GET/HEAD/OPTIONS methods.
- JSON request bodies remain bounded and configuration is capped at 10mb.
- Request, header, and keep-alive timeouts are explicitly configurable.
- Additional HTTP security headers include X-DNS-Prefetch-Control and X-Download-Options.
- Unexpected server errors remain sanitized from client responses.
- Sensitive logging fields remain redacted.

### Configuration

New server settings are available in .env.example:

- REQUEST_TIMEOUT_MS=120000
- HEADERS_TIMEOUT_MS=15000
- KEEP_ALIVE_TIMEOUT_MS=5000

The existing configuration boundary continues to validate environment-specific requirements and now validates CORS origin syntax and request-body size values.

### Verification

The repository now exposes:

- npm run format:check
- npm run lint
- npm run typecheck
- npm test
- npm run build
- npm run audit
- npm run verify

npm run verify executes formatting, lint, type checking, tests, build, and dependency audit.

### CI

GitHub Actions workflow: .github/workflows/verify.yml

The workflow installs dependencies with npm install, then runs the complete verification suite on pushes to main and pull requests. Deployment automation is intentionally not included.

The repository currently has no committed package-lock.json, so CI deliberately uses npm install rather than npm ci.

### Dependency audit

The package manifest was reviewed for duplicate/obsolete functionality and no new dependency was introduced by Phase 1.5. A local npm audit could not be completed in the implementation environment because registry access was unavailable. npm run audit is therefore part of the CI verification workflow rather than being reported as locally passed.

### Documentation

Added:

- docs/phase-1-architecture.md
- docs/cross-repository-contracts.md

These documents distinguish implemented foundation work from future/deferred functionality.

### Cross-repository boundary

Only gaje9dra/parento-backend was modified. No code, configuration, or documentation was changed in gaje9dra/parento-admin or gaje9dra/parento-managed.

Authentication, enrollment, device control, realtime communication, location, media, policy enforcement, surveillance, and Android security bypasses remain deferred.

## Phase 2.2 — Core Database Schema & Domain Persistence

Phase 2.2 preserves the Phase 2.1 PostgreSQL architecture and adds the minimal persistent Parento domain foundation. Only `gaje9dra/parento-backend` is modified.

### Database architecture

```
API
 ↓
Service
 ↓
Repository
 ↓
PostgreSQL
```

No new public business API endpoints are exposed in this phase.

### Core entities

The Phase 2.2 schema contains:

- `admins` — administrator identity metadata only.
- `managed_devices` — minimal managed-device ownership and status.
- `enrollments` — minimal future enrollment/pairing persistence foundation.

Relationships:

```
Admin
 └──< ManagedDevice
       └──< Enrollment
          └── Admin
```

### Admin

Fields include UUID identity, unique case-insensitive email, optional display name, `ACTIVE`/`DISABLED` status, and UTC timestamps.

No passwords, JWTs, OAuth credentials, access tokens, refresh tokens, or other authentication secrets are stored.

### Managed device

Fields include UUID identity, owning admin, name, platform, enrollment status, operational status, UTC creation/update timestamps, and optional last-seen timestamp.

The schema does not contain location history, media, telemetry, camera data, microphone recordings, or screen captures.

### Enrollment

Fields include UUID identity, unique enrollment identifier, admin/device references, status, creation/expiration/completion timestamps.

The persistence model does not implement QR generation, pairing UI, enrollment APIs, provisioning, Device Owner setup, authentication, or reusable permanent pairing secrets.

### Status constraints

Admin:
`ACTIVE`, `DISABLED`

Managed device:
`PENDING`, `ACTIVE`, `REVOKED`

Enrollment:
`PENDING`, `COMPLETED`, `EXPIRED`, `REVOKED`

PostgreSQL CHECK constraints enforce these values.

### Migration

Phase 2.1 baseline:

`migrations/0001_phase_2_1_baseline.sql`

Phase 2.2 schema:

`migrations/0002_core_domain.sql`

The migration is transactional and deterministic. Development reset is explicitly non-production and recreates the PostgreSQL public schema before replaying migrations.

### Repository and service boundaries

Domain models live under `src/domain`.

Repository interfaces live under `src/repositories`, with PostgreSQL implementations kept separate from domain models.

Small persistence services generate UUIDs and enforce persistence-level business checks such as enrollment expiration before repository access.

PostgreSQL constraint errors are mapped to `PersistenceError` categories and are not exposed as raw database errors.

### Testing

With `DATABASE_URL` configured, Phase 2.2 integration tests cover:

- admin creation/retrieval
- case-insensitive unique email
- admin status changes
- managed-device creation and admin ownership
- orphan foreign-key rejection
- enrollment creation and references
- enrollment expiration validation
- status changes
- migration application from the Phase 2.1 baseline

Tests use the configured isolated PostgreSQL test database and reset it before each persistence test.

### Deferred

Authentication, password hashing, JWT/refresh tokens, OAuth, enrollment APIs, QR pairing, Device Owner provisioning, WebSockets, FCM, monitoring, location, camera, microphone, audio, screen capture/sharing, device commands, application blocking, website/DNS/VPN filtering, policy enforcement, notifications, and complete audit logging remain deferred.

## Phase 2.4 — Persistence Services, Query Layer & Database Operational Readiness

Phase 2.4 strengthens the persistence foundation without introducing public authentication or device-management APIs.

Implemented:

- domain-level persistence service contracts for Admin, ManagedDevice, and Enrollment
- complete repository query contracts including existence checks and bounded list operations
- cursor pagination with a maximum page size of 100 and deterministic created_at DESC / id DESC ordering
- PostgreSQL indexes aligned with administrator/device enrollment list access patterns
- explicit transactional migration execution and rollback behavior
- safe PostgreSQL constraint/infrastructure error mapping
- database-backed readiness requiring an actual reachable PostgreSQL connection
- configuration-driven connection pooling and graceful database shutdown
- operational persistence documentation and isolated PostgreSQL CI coverage

See `docs/phase-2.4-persistence-operations.md` for the deployment and persistence operations guide.

Phase 2.4 still defers authentication, enrollment APIs, realtime communication, monitoring, sensitive device capabilities, device control, application/website blocking, policy enforcement, and complete audit implementation.

## Phase 2.5 — Database Security, Testing & Phase 2 Completion

Phase 2.5 is the final backend persistence hardening pass before authentication work. It keeps the API → validation → service → repository → PostgreSQL architecture and does not introduce Phase 3 functionality.

### Hardening completed

- PostgreSQL persistence errors are mapped centrally to stable persistence-domain errors.
- Repository queries remain parameterized and bounded.
- Cursor pagination retains deterministic created_at DESC, id DESC ordering with a maximum page size of 100.
- Migration history is validated for unknown IDs, name mismatches, and duplicate repository migration IDs.
- Migration execution and its schema_migrations record remain transactional.
- Clean-install and Phase 2.3 → Phase 2.4 migration paths are integration-tested.
- Final schema constraints and Phase 2.4 query indexes are integration-tested.
- Database credentials remain environment-only and production reset remains disabled.

### Documentation

See docs/phase-2.5-security-testing.md for the final Phase 2 database security, operational, testing, and deferred-work boundary.

### Phase 2 completion boundary

Phase 2 now provides PostgreSQL persistence, migrations, Admin/ManagedDevice/Enrollment models, relational integrity, repository contracts, persistence services, bounded queries, cursor pagination, transactions, database readiness, sanitized persistence errors, isolated PostgreSQL testing, and operational documentation.

Authentication, enrollment/pairing workflows, realtime communication, monitoring, location, camera/microphone/audio/screen capture, device control, application/website blocking, policy enforcement, notifications, and complete audit functionality remain deferred to later phases.

## Phase 3.1 — Backend Admin Authentication Foundation

Phase 3.1 adds the backend foundation for administrator authentication while preserving the Phase 1–2 architecture and repository boundaries.

Implemented:

- separate administrator authentication identity from managed-device and Android installation identities
- scrypt password hashing with per-password random salts
- nullable password credential storage for existing Admin records without inventing credentials
- short-lived opaque access credentials
- rotating opaque refresh credentials
- server-side session persistence, expiration, and revocation
- generic authentication failure behavior to reduce account enumeration
- reusable administrator authentication middleware
- authenticated current-admin identity endpoint
- logout/session invalidation
- configuration-driven access/session TTLs
- Phase 3.1 database migration
- authentication API documentation
- authentication unit/API tests and database migration coverage

Endpoints:

- `POST /api/v1/auth/admin/login`
- `POST /api/v1/auth/admin/refresh`
- `GET /api/v1/auth/admin/me`
- `POST /api/v1/auth/admin/logout`

Existing Phase 1–2 health/readiness endpoints remain unchanged. The authentication layer does not implement Admin Android UI, Google OAuth, managed-device enrollment, realtime communication, device commands, monitoring, or policy enforcement.

See `docs/phase-3.1-admin-authentication.md` for the detailed security and integration contract.

## Phase 3.2 — Authentication Hardening & Admin Authorization

Phase 3.2 hardens the existing Phase 3.1 administrator authentication boundary without changing the opaque session architecture.

### Authentication security

- Authenticated identity is derived only from the server-validated opaque access credential.
- GET /api/v1/auth/admin/me and logout require centralized authentication and explicit administrator authorization middleware.
- Disabled administrators are rejected both during login and when validating an existing session.
- Access credentials are short-lived and server-side sessions remain authoritative.
- Refresh credentials are rotated atomically; a previously used refresh credential is rejected on replay.
- Session persistence stores SHA-256 hashes of opaque credentials rather than plaintext tokens.
- Passwords use the existing scrypt policy and persisted hashes are accepted only when they use the backend's supported scrypt parameters.
- Login failures use the same safe INVALID_CREDENTIALS response for nonexistent, wrong-password, and disabled administrator accounts.
- Authentication request bodies reject unexpected fields and enforce the password length policy before authentication work.
- Request bodies remain globally bounded by REQUEST_BODY_LIMIT.

### Authentication rate limiting

Admin login and refresh endpoints use express-rate-limit through the existing backend rate-limit configuration.

The default configuration is 10 requests per 15 minutes per direct network peer. Production configuration must keep RATE_LIMIT_ENABLED=true.

The limiter deliberately keys from the direct TCP peer rather than trusting client-supplied forwarding headers. If the backend is deployed behind a reverse proxy, the proxy must be part of the intended network boundary; at multi-instance scale, a shared rate-limit store or edge/API-gateway limiter is required because the default store is process-local.

Rate-limit responses use HTTP 429 with the standard RATE_LIMITED error contract.

### Account-status behavior

Account status is checked from PostgreSQL on every authenticated access-token validation and refresh. A session issued while an administrator is ACTIVE therefore stops authenticating after the account is changed to DISABLED; this is server-side immediate status enforcement for the current architecture.

### Logout and revocation

Logout revokes the current server-side session. Existing access credentials for that session fail authentication immediately after revocation.

Refresh rotation uses an atomic database update conditioned on the current refresh-token hash, so a previously rotated refresh credential cannot be replayed.

### Security limitations

The default rate limiter uses the library's process-local store. It is suitable as a single-instance baseline but is not a distributed abuse-control mechanism. Production deployments with multiple backend instances must use a shared rate-limit store or an equivalent trusted edge control.

No password-change endpoint, OAuth, RBAC system, device enrollment, pairing, realtime communication, device control, monitoring, location, media capture, policy enforcement, or remote command functionality is introduced by Phase 3.2.

## Phase 3.3 — Admin Session Lifecycle, Authorization & Account Security

Phase 3.3 hardens the existing opaque server-side administrator session
architecture.

Implemented:

- server-side enforcement of access/session expiration
- immediate rejection of sessions belonging to disabled administrators
- atomic refresh-token rotation with access expiry capped by the parent session
- independent concurrent administrator sessions
- authenticated-session-specific logout/revocation
- opportunistic cleanup of expired and long-revoked session rows
- structured authentication and authorization security events without
  credential logging
- generic authentication failures for account-enumeration protection
- expanded session lifecycle and authorization tests
- migration/index support for session cleanup
- Phase 3.3 authentication lifecycle documentation

No password-change endpoint is exposed because credential-change functionality
is not yet part of the roadmap. No RBAC system or managed-device functionality
is introduced.

See `docs/phase-3.3-admin-session-lifecycle.md`.

## Phase 5.1 — Secure Device Enrollment & Pairing Foundation

Phase 5.1 adds the backend foundation for intentional administrator-authorized managed-device enrollment.

Implemented:

- temporary enrollment sessions separate from the legacy Phase 2 enrollment persistence model
- explicit enrollment-session state machine
- configurable expiration with a 15-minute default and 24-hour maximum
- cryptographically random 256-bit one-time authorization secrets
- SHA-256 secret verification storage; raw secrets are never persisted
- authenticated administrator ownership checks
- disabled-administrator rejection during enrollment completion
- transactional one-time consumption with PostgreSQL row locking
- atomic managed-device association
- stable installation-identity uniqueness enforcement
- bounded verification attempts and dedicated verification rate limiting
- replay and concurrent-consumption protection
- cancellation and ownership-scoped status endpoints
- security-focused logging without enrollment secrets
- Phase 5.1 API/OpenAPI contracts
- unit and PostgreSQL integration tests for lifecycle, ownership, replay, identity conflicts, and concurrency

### Phase 5.1 endpoints

- POST /api/v1/devices/enrollments
- GET /api/v1/devices/enrollments
- GET /api/v1/devices/enrollments/{enrollmentId}
- POST /api/v1/devices/enrollments/{enrollmentId}/cancel
- POST /api/v1/devices/enrollments/{enrollmentId}/consume

The consume endpoint is intentionally protected by one-time authorization material rather than administrator credentials because the future Managed Android client will perform the device-side enrollment operation.

### Phase 5.1 database

Migration: migrations/0007_phase_5_1_enrollment_sessions.sql

The migration preserves existing Phase 2 enrollment data and adds the temporary enrollment-session security boundary.

### Cross-repository boundary

Only gaje9dra/parento-backend is modified.

The future gaje9dra/parento-managed integration contract is documented in docs/phase-5.1-enrollment.md; no Android code is changed in this phase.

See docs/phase-5.1-enrollment.md and openapi.yaml for the complete contract and security model.

Phase 5.1 implementation verification is performed by the repository CI workflow before the phase is marked complete.
