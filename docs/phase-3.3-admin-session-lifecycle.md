# Phase 3.3 — Admin Session Lifecycle, Authorization & Account Security

## Scope

Phase 3.3 modifies only `gaje9dra/parento-backend`. It hardens the existing Phase 3.1/3.2 opaque server-side administrator session architecture.

No managed-device, enrollment, pairing, realtime, monitoring, policy, or device-control functionality is introduced.

## Session lifecycle

Administrator authentication uses one server-side session row per login. Multiple concurrent sessions for the same administrator are independent.

- Access credentials are short-lived opaque values.
- Refresh credentials are rotated atomically.
- Logout revokes only the authenticated session represented by the presented access credential.
- Revocation is checked before an access credential can authenticate.
- Session and access expiration are enforced server-side.
- A refreshed access credential can never outlive its parent session.
- Expired sessions and sessions revoked for more than 24 hours are removed opportunistically during login/refresh operations. The cleanup is bounded by indexed expiration/revocation fields and does not affect active sessions.

Repeated logout after the session has already been revoked is harmless: the revoked credential cannot authorize protected resources and no other administrator session is revoked.

## Account status

The administrator record is re-read from PostgreSQL during access-token validation and refresh.

A transition from `ACTIVE` to `DISABLED` therefore invalidates existing authenticated access without requiring token expiration. Login and refresh for disabled administrators fail through the established authentication error contract.

## Authorization

Protected administrator routes require:

1. a valid server-side authenticated session;
2. an administrator record that is currently `ACTIVE`;
3. centralized authorization middleware.

Protected code does not accept a client-supplied administrator ID as the source of caller identity. The authenticated administrator is propagated through the Express request context.

The current project does not require a role hierarchy, so no RBAC system is introduced.

## Password security

The existing scrypt password policy remains unchanged. Passwords and password hashes are not returned or logged. No public password-change endpoint is introduced because credential-change functionality is not part of the current roadmap.

Authentication failures retain the generic `INVALID_CREDENTIALS` contract to avoid exposing account existence.

## Abuse protection

Login and refresh remain protected by the existing express-rate-limit configuration. The default limiter is keyed by the direct network peer and is process-local. Multi-instance deployments require a shared rate-limit store or trusted edge/API-gateway control.

Rate-limit responses remain HTTP 429 with the standard `RATE_LIMITED` error contract.

## Security logging

Authentication and authorization failures, successful login, and logout generate structured events containing request/correlation IDs and only the minimum justified administrator identifier where available.

Passwords, access credentials, refresh credentials, authorization headers, cookies, and other secrets remain redacted.

The full audit trail remains deferred to the later audit phase.

## Android contract implications

The Admin Android client should:

- treat HTTP 401 from protected endpoints as an authentication/session failure;
- clear local credentials when the backend rejects the current session;
- not assume a disabled administrator remains authorized merely because a locally stored session has not expired;
- preserve independent sessions on separate clients;
- treat logout as successful once the local session is cleared even if a repeated server logout is rejected because the session was already revoked.

No Android repository is modified by Phase 3.3.
