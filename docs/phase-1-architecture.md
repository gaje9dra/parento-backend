# Parento Backend — Phase 1 Architecture

## Scope

This document describes the backend foundation implemented through Phase 1.5. It does not describe future business features as if they exist.

## Implemented

### API layer

- Express 5 application.
- Versioned API base path, default /api/v1.
- Operational endpoints: GET /api/v1/health and GET /api/v1/ready.
- Standard success envelope contains data and requestId.
- Standard error envelope contains error.code, error.message, optional safe validation metadata, and requestId.

### Middleware

Request flow: incoming request -> request correlation -> HTTP security headers -> explicit CORS handling -> bounded JSON parsing -> versioned router -> controller -> centralized error handling.

The backend does not log request bodies by default. Authorization headers and cookies are redacted by the HTTP/application loggers.

### Configuration

src/config/env.ts is the single configuration boundary. It validates environment/server settings, API base path, database boundary, explicit CORS origins, CORS credential compatibility, request body size, HTTP timeout values, logging, future authentication configuration boundaries, rate-limit configuration, realtime flag, and external service URLs.

Production rejects wildcard CORS and requires explicit database/JWT configuration placeholders.

### Validation

The Zod-based validation boundary remains available through src/middleware/validate.ts and src/validation. It is intentionally not connected to speculative business endpoints.

### Error handling

Malformed JSON and oversized bodies map to safe standardized API errors. Unexpected exceptions map to 500 INTERNAL_SERVER_ERROR. Client responses never contain the original exception, stack trace, filesystem path, SQL text, environment variables, or credentials.

### Logging

Pino and pino-http provide structured logging. Sensitive fields including authorization headers, cookies, tokens, passwords, private keys, API keys, secrets, and database URLs are redacted.

### Testing

Vitest and Supertest cover configuration, validation contracts, health/readiness, 404/405 behavior, request IDs, malformed JSON, request limits, CORS, security headers, and unexpected-error sanitization. Tests do not require a database or external API.

### Health/readiness

Health reports only that the HTTP service is responding. Readiness currently reports ready because no external infrastructure dependency is initialized in Phase 1. The controller remains the extension point for future PostgreSQL, Redis, realtime, or external-service checks.

### Server operations

The HTTP server has bounded request/header/keep-alive timeouts from configuration. SIGINT and SIGTERM trigger graceful HTTP-server shutdown. No speculative database or realtime shutdown lifecycle exists.

## Security baseline

- Express x-powered-by disabled.
- X-Content-Type-Options: nosniff.
- X-Frame-Options: DENY.
- Referrer-Policy: no-referrer.
- restrictive Permissions-Policy.
- X-DNS-Prefetch-Control: off.
- X-Download-Options: noopen.
- explicit CORS.
- production wildcard-CORS rejection.
- credential/wildcard-CORS incompatibility rejection.
- bounded JSON body size.
- HTTP timeout configuration.
- centralized error sanitization.
- sensitive log-field redaction.
- environment-based configuration.
- .env ignored by Git.

## Intentionally deferred

- administrator authentication
- managed-device authentication
- OAuth
- JWT issuance or refresh tokens
- enrollment and QR pairing
- device identity provisioning
- device commands
- realtime/WebSockets/FCM
- location
- camera/microphone/audio
- screen sharing
- application or website blocking
- DNS/VPN filtering
- Device Owner/Android Enterprise provisioning
- device locking or remote wipe
- policy enforcement
- payments
- surveillance or covert persistence

## Repository boundaries

Only gaje9dra/parento-backend is modified by this phase.
The Admin and Managed Android applications remain separate repositories and will consume authenticated backend contracts only in later phases.