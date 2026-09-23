# Parento Backend

Backend/API/database/realtime foundation for Parento.

## Repository boundary

This phase modifies only:

- gaje9dra/parento-backend

The companion Android repositories are intentionally untouched:

- gaje9dra/parento-admin
- gaje9dra/parento-managed

## Phase 1.2 — Backend Core Architecture & Contracts

Phase 1.2 builds on Phase 1.1 and establishes reusable contracts without implementing authentication, enrollment, device control, or policy functionality.

### Project structure

~~~
src/
  api/
    contracts.ts
    request-context.ts
  config/
    env.ts
  controllers/
    health.controller.ts
  db/
    entities.ts
    index.ts
  logging/
    logger.ts
  middleware/
    error-handler.ts
    validate.ts
  rate-limit/
    index.ts
  realtime/
    index.ts
  repositories/
    repository.ts
  routes/
    index.ts
    v1/
      index.ts
      health.routes.ts
  security/
    authorization.ts
    index.ts
  services/
    service.ts
  types/
    errors.ts
  validation/
    index.ts

tests/
  contracts.test.ts
  error.test.ts
  health.test.ts

openapi.yaml
~~~

## API versioning

All public API routes use /api/v1.

Future resource areas are planned beneath that namespace:

~~~
/api/v1/auth
/api/v1/devices
/api/v1/enrollment
/api/v1/policies
/api/v1/events
/api/v1/admin
~~~

These are architectural plans, not implemented endpoints.

## Request/response contract

Successful responses use a typed data envelope:

~~~
{
  "data": {}
}
~~~

A request correlation ID may also be returned. The server accepts a safe X-Request-Id value or generates one and returns it in the response header.

Validation is centralized through the validation module and route middleware. Future request schemas must be applied before business logic executes.

## Error contract

Errors use:

~~~
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request validation failed."
  },
  "requestId": "..."
}
~~~

Stable error codes:

- AUTHENTICATION_REQUIRED
- AUTHORIZATION_DENIED
- INVALID_REQUEST
- RESOURCE_NOT_FOUND
- CONFLICT
- RATE_LIMITED
- INTERNAL_SERVER_ERROR
- NOT_FOUND

Production responses must not expose stack traces, database errors, secrets, credentials, or internal file paths.

## Service/repository architecture

Business logic follows:

~~~
HTTP route/controller
        |
        v
     Service
        |
        v
 Repository / data access
        |
        v
     Database
~~~

Controllers handle HTTP translation. Services own business rules. Repositories own persistence access.

## Identity and authorization boundaries

The backend keeps these identities separate:

- Administrator — the authenticated person authorized to operate Parento.
- Managed Device — the enrolled Android device.

Conceptually:

~~~
Administrator
   |
   +-- Managed Device A
   +-- Managed Device B
   +-- Managed Device C
~~~

Authentication is not implemented in Phase 1.2.

The authorization boundary in src/security/authorization.ts requires a verified administrator identity and a policy decision for the specific managed-device resource. An arbitrary client-supplied device ID is never proof of authorization.

## Database architecture

The database abstraction defines future boundaries for:

- Administrator
- ManagedDevice
- DeviceEnrollment
- DeviceCredential
- Policy
- ApplicationRule
- WebsiteRule
- DeviceEvent
- AuditEvent

No production schema, speculative fields, ORM, credentials, or live database connection is introduced in this phase.

## API documentation

openapi.yaml is the documentation foundation. It describes the implemented health endpoint and shared error contract without pretending planned resources are implemented.

Implemented:

- GET /api/v1/health

Planned only:

- authentication
- enrollment
- device resources
- policies
- events
- admin resources
- remote/device-control operations

## Testing strategy

The test structure supports:

- API validation and contract tests
- service tests
- error handling tests
- repository/data-access tests

Phase 1.2 adds focused validation and error-contract tests. Later phases should add tests at each service/repository boundary.

## Security baseline

- Secrets are environment-based and excluded from Git.
- Input validation is centralized.
- Error responses are safe for production.
- Structured logging redacts authorization headers, cookies, tokens, passwords, private keys, and secrets.
- No arbitrary command execution is exposed.
- No hidden admin access or undocumented privileged endpoints exist.
- Future device commands must be explicitly authenticated and authorized.
- Rate limiting, throttling, abuse detection, and audit logging have extension points only; no production abuse system is implemented here.

## Cross-repository requirements

No code changes are required in the companion repositories for Phase 1.2.

Future interface work:

| Repository | Required change | Reason | Expected interface |
|---|---|---|---|
| parento-admin | Later integrate documented API contracts | Admin operations will eventually call backend resources | HTTPS JSON API under /api/v1 with request IDs and shared error codes |
| parento-managed | Later integrate device-facing contracts | Managed device will eventually authenticate/enroll and receive authorized traffic | HTTPS/realtime interfaces defined in later phases |

These are documentation requirements only; neither repository was modified.

## Development commands

~~~
npm install
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
npm run format
npm run format:check
~~~

## Phase status

Phase 1.2 establishes architecture and contracts only. It does not implement admin login, OAuth, enrollment, QR pairing, device credentials, location, streaming, application/website blocking, device locking, remote commands, or push notifications.


## Phase 1.3 — Backend Configuration, Environment & Operational Baseline

Phase 1.3 adds centralized typed environment configuration, startup validation, development/test/production separation, logging redaction, explicit CORS configuration, HTTP security headers, request-body limits, and health/readiness boundaries. Future authentication, enrollment, device control, policy enforcement, realtime control, and surveillance features remain deferred.

### Local setup

1. Run npm install.
2. Copy .env.example to .env for local development.
3. Set local environment values as needed.
4. Run npm run dev.
5. Run npm test, npm run typecheck, npm run lint, and npm run build.
6. Use npm run format:check to verify formatting.

### Configuration categories

Configuration is centralized in src/config/env.ts and exposed as typed categories: app, server, database, logging, cors, security, rateLimit, realtime, and externalServices. Application code should consume this configuration instead of scattering process.env access.

Startup flow is: load environment, validate environment, build application configuration, initialize application, then start the server. ConfigurationError reports variable names and safe validation messages without printing submitted secret values.

### Environment variables

Supported variables are NODE_ENV, APP_NAME, HOST, PORT, API_BASE_PATH, DATABASE_URL, LOG_LEVEL, LOG_PRETTY, CORS_ORIGINS, CORS_CREDENTIALS, JWT_ISSUER, JWT_AUDIENCE, JWT_ACCESS_TOKEN_TTL_SECONDS, SESSION_TTL_SECONDS, REQUEST_BODY_LIMIT, TRUST_PROXY, RATE_LIMIT_ENABLED, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS, REALTIME_ENABLED, and EXTERNAL_SERVICE_BASE_URLS.

Production explicitly requires DATABASE_URL, CORS_ORIGINS, JWT_ISSUER, and JWT_AUDIENCE. These JWT values are configuration boundaries only; authentication and token issuance are not implemented in Phase 1.3.

.env.example is the tracked local configuration template. .env and other environment-specific secret files remain ignored by Git.

### Logging and HTTP baseline

Centralized Pino logging redacts authorization headers, cookies, access/refresh tokens, passwords, private keys, API keys/secrets, and database URL fields.

HTTP middleware establishes X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: no-referrer, a restrictive Permissions-Policy, configured request-body limits, centralized CORS, and proxy trust controlled by configuration. Production CORS uses explicit configured origins rather than wildcard access.

### Health and readiness

GET /api/v1/health confirms the application process responds. GET /api/v1/ready provides a dependency-safe readiness response without exposing environment variables, secrets, database credentials, or infrastructure details. A live database readiness check is intentionally deferred because this phase does not create a database connection.

### Testing

Phase 1.3 adds configuration tests for valid configuration, invalid values, required production configuration, secret-value safety, and external-service URL validation. Existing API contract, error, and health tests remain in place.

### Cross-repository requirements

No code changes are required in parento-admin or parento-managed for Phase 1.3. Future phases will integrate those repositories with the documented /api/v1 backend contracts. Neither repository was modified.
