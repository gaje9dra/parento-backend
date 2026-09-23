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

~~~
/api/v1
~~~

It is controlled by API_BASE_PATH, validated as a versioned /api/vN path, and mounted centrally so future route groups can be added without duplicating the prefix.

### Implemented endpoints

~~~
GET  /api/v1/health
GET  /api/v1/ready
~~~

HEAD is supported by Express for the GET health route. CORS preflight uses OPTIONS when an allowed Origin is supplied.

Unknown routes return a JSON 404 NOT_FOUND response. Known health/readiness routes return 405 METHOD_NOT_ALLOWED for unsupported methods.

No authentication, enrollment, device, policy, realtime, or surveillance endpoints are implemented.

### Request lifecycle

The current lifecycle is:

~~~
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
~~~

Future request validation middleware remains available as an architectural boundary for resource-specific schemas. No speculative business schemas are added here.

### Request IDs

Every request receives an X-Request-Id response header and a requestId response field when a JSON API response is returned.

A syntactically safe incoming X-Request-Id may be reused for correlation. Otherwise the backend generates a UUID using the runtime cryptographic random UUID facility. Request IDs are tracing identifiers only and are not authentication credentials or authorization decisions.

### Success response contract

Successful JSON API responses use:

~~~json
{
  "data": {},
  "requestId": "..."
}
~~~

Health and readiness use the same envelope:

~~~json
{
  "data": {
    "status": "ok",
    "service": "parento-backend",
    "version": "1"
  },
  "requestId": "..."
}
~~~

### Error response contract

Client-facing errors use:

~~~json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Route not found."
  },
  "requestId": "..."
}
~~~

Validation metadata may be included for non-server errors when a future endpoint supplies a schema.

Production responses do not expose stack traces, SQL errors, filesystem paths, environment variables, credentials, tokens, or internal service details.

### HTTP status conventions

The backend reserves these conventions:

| Status | Convention |
|---|---|
| 200 | Successful request |
| 201 | Resource created |
| 202 | Request accepted for asynchronous processing |
| 204 | Successful response with no body, including accepted CORS preflight |
| 400 | Malformed or invalid request |
| 401 | Authentication required; reserved for future authentication |
| 403 | Authorization denied or CORS origin rejected |
| 404 | Route/resource not found |
| 405 | HTTP method not allowed |
| 409 | Resource conflict |
| 413 | Request body exceeds configured limit |
| 422 | Semantically invalid entity; reserved for future resource validation |
| 429 | Rate limited; reserved for future rate-limit enforcement |
| 500 | Unexpected internal server error |
| 503 | Service unavailable; reserved for future dependency readiness |

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

Phase 1.4 establishes the HTTP/API request pipeline and operational endpoints only. It does not implement admin login, OAuth, enrollment, QR pairing, device credentials, location, streaming, application/website blocking, device locking, remote commands, push notifications, or other future business functionality.
