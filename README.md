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
