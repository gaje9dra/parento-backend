# Parento Backend

Backend foundation for **Parento**, an authorized Android device-management platform.

## Architecture

Parento is intentionally split into three repositories:

- `gaje9dra/parento-admin` — Android administrator/controller application.
- `gaje9dra/parento-managed` — Android managed-device application.
- `gaje9dra/parento-backend` — API, persistence, realtime infrastructure, and authorization boundary.

The backend is the trusted communication and authorization layer between the two Android applications.

```text
Admin App
    |
    v
Parento Backend
    |
    v
Managed Device App
```

Repositories remain strictly separated. This repository must not contain Android application code.

## Phase 1.1 scope

Phase 1.1 establishes only the backend development foundation:

- TypeScript/Node.js application startup
- Environment-based configuration
- Versioned API routing under `/api/v1`
- Health check
- Centralized error responses
- Structured, redacted logging
- Database boundary preparation
- Security/identity boundary preparation
- Realtime transport boundary preparation
- Automated test foundation

The following are intentionally **not implemented** in Phase 1.1:

- Administrator authentication
- Managed-device authentication
- Device enrollment or pairing
- Device identity persistence
- Location
- Screen sharing
- Audio functionality
- Application management/blocking
- Website/network policies
- Device restrictions
- Policy synchronization
- Device commands or remote control
- Notifications
- Audit/security event persistence

No mock endpoint pretends that these features exist.

## Project structure

```text
src/
  app.ts                    # Express application composition
  server.ts                 # Process startup and graceful shutdown
  config/
    env.ts                  # Validated environment configuration
  controllers/
    health.controller.ts    # Phase 1.1 health endpoint
  db/
    index.ts                # Future database boundary
  logging/
    logger.ts               # Structured/redacted logger
  middleware/
    error-handler.ts        # 404 and centralized error handling
  realtime/
    index.ts                # Future realtime boundary
  routes/
    index.ts                # API router
    v1/
      index.ts
      health.routes.ts
  security/
    index.ts                # Future identity/security boundary
  types/
    errors.ts               # Application error type

tests/
  health.test.ts
```

## Requirements

- Node.js 24.21.0 or newer
- npm 11.x or newer

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create local configuration:

Windows CMD:

```cmd
copy .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

3. Start the development server:

```bash
npm run dev
```

The default local server listens on `http://127.0.0.1:3000`.

## Health check

Unauthenticated endpoint:

```text
GET /api/v1/health
```

Example response:

```json
{
  "status": "ok",
  "service": "parento-backend",
  "version": "1"
}
```

The endpoint is intentionally small and suitable for future deployment health checks.

## Configuration

Copy `.env.example` to `.env`.

### Required

There are no secrets or production credentials required by Phase 1.1.

### Optional

- `NODE_ENV` — `development`, `test`, or `production`
- `HOST` — bind address; defaults to `127.0.0.1`
- `PORT` — HTTP port; defaults to `3000`
- `LOG_LEVEL` — Pino log level; defaults to `info`
- `DATABASE_URL` — reserved for later database phases; unused in Phase 1.1
- `REALTIME_ENABLED` — reserved for later realtime phases; defaults to `false`

Never commit `.env`, passwords, API keys, tokens, private keys, or production credentials.

## Error handling

The backend has one centralized error boundary. Application errors can expose:

- HTTP status
- stable error code
- safe human-readable message
- optional safe metadata for non-5xx errors

Unexpected errors are returned as a generic `500 INTERNAL_SERVER_ERROR` response. Stack traces are logged server-side and are not returned to clients.

## Logging and security

Pino provides structured logging. Authorization headers, cookies, tokens, passwords, private keys, and secrets are redacted from logs.

Future authentication must distinguish:

- **Administrator identity** — the authenticated controller user.
- **Managed-device identity** — an enrolled Android device.

They must not be treated as interchangeable identities. Future device commands must require explicit authentication and authorization; no unauthenticated command endpoint is part of this foundation.

## Database and realtime boundaries

Phase 1.1 deliberately does not define speculative domain tables or connect to a production database. The database module is a boundary for later persistence work.

Likewise, realtime is represented only as an architectural boundary. No device commands, remote control, session signaling, or policy synchronization are implemented.

## Development commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
npm run format:check
```

## Cross-repository policy

This repository is limited to `gaje9dra/parento-backend`.

If a future requirement belongs in `parento-admin` or `parento-managed`, it must be documented as a cross-repository requirement and implemented in that repository during its own phase. It must not be implemented here.

## Phase 1.1 status

This phase is complete when the repository passes formatting, lint/static analysis, tests, build/type checking, and local health-check verification without introducing functionality from future phases.
