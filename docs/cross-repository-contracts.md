# Parento — Cross-Repository Backend Contracts

## Current boundary

Parento consists of three separate repositories:

- gaje9dra/parento-backend — API, persistence, authorization, and realtime infrastructure.
- gaje9dra/parento-admin — administrator/controller Android application.
- gaje9dra/parento-managed — managed Android application.

Phase 1.5 changes only the backend repository.

## Current interface

Both Android applications will eventually communicate with the backend through the versioned API base path:

GET /api/v1/health
GET /api/v1/ready

These are operational endpoints only. They are not authentication or device-management APIs.

## Future Admin integration

parento-admin will eventually require authenticated backend APIs for administrator sessions, managed-device listing/details, policy operations, audit information, and realtime coordination.

Authentication, authorization, tokens, and business endpoints are intentionally not defined or implemented in Phase 1.5.

## Future Managed integration

parento-managed will eventually require authenticated and authorized APIs for enrollment, device identity, status, policy application, and other permitted management operations.

Enrollment, device identity provisioning, commands, and policy enforcement are intentionally not defined or implemented in Phase 1.5.

## Contract principles

- Backend contracts must be explicitly versioned.
- Authentication and authorization must be enforced before sensitive operations.
- Device-management operations must be attributable to an authorized principal.
- Sensitive values must never be returned through operational health endpoints.
- Request IDs are correlation identifiers, not credentials.
- Android repositories remain independent from backend implementation details.

## Deferred

No fake authentication endpoints, fake device endpoints, QR pairing endpoints, command endpoints, WebSocket endpoints, or surveillance mechanisms are introduced merely to document future integration.
