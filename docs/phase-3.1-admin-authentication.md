# Phase 3.1 — Backend Admin Authentication Foundation

## Scope

Phase 3.1 modifies only `gaje9dra/parento-backend`. It establishes administrator password authentication and server-side opaque sessions for the future Parento Admin Android client.

The Admin Android UI, Google OAuth, managed-device enrollment, device commands, realtime communication, and device-management APIs remain deferred.

## Identity boundaries

Three identities remain distinct:

- Backend administrator identity: `admins.id`
- Backend managed-device identity: `managed_devices.id`
- Android installation identity: the locally generated installation UUID in each Android repository

An Android installation ID is not an authentication credential or authorization identity.

## Password storage

Administrator passwords are hashed with Node.js `scrypt`, using a unique random 128-bit salt and memory-hard parameters. Only the encoded password hash is stored.

Passwords, password hashes, and credentials are never returned through API responses or logs. Existing Admin rows from Phase 2 have a nullable password hash; they cannot authenticate until a secure provisioning flow assigns a password. No default password is created.

OWASP recommends Argon2id where available and scrypt as an appropriate alternative when Argon2id is unavailable. urlOWASP Password Storage guidancehttps://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

## Session architecture

Phase 3.1 uses opaque server-side access and refresh credentials rather than implementing a custom JWT format.

- Access credential: cryptographically random, 32-byte token, short-lived.
- Refresh credential: cryptographically random, 32-byte token, rotated on use.
- Only SHA-256 hashes of these credentials are stored in `admin_sessions`.
- Refresh rotation is compare-and-update against the current refresh-token hash, preventing the same refresh token from being reused successfully.
- Logout revokes the server-side session.
- Disabled administrators can no longer authenticate or use existing sessions.
- Access and session expiration are enforced server-side.

The opaque token design keeps credential meaning server-side and avoids placing administrator identity or other data inside client tokens. Session credentials are generated using the runtime cryptographic CSPRNG. urlOWASP Session Management guidancehttps://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

## API

Implemented endpoints:

- `POST /api/v1/auth/admin/login`
- `POST /api/v1/auth/admin/refresh`
- `GET /api/v1/auth/admin/me`
- `POST /api/v1/auth/admin/logout`

Authentication failures use a generic credential error and do not disclose whether an email exists.

Protected endpoints use a reusable Bearer authentication middleware. The middleware attaches only the authenticated administrator identity to the Express request context.

## Configuration

Phase 3.1 uses:

- `AUTH_ACCESS_TOKEN_TTL_SECONDS` — access credential lifetime, default 900 seconds.
- `SESSION_TTL_SECONDS` — absolute session lifetime, default 86400 seconds.
- `JWT_ISSUER` / `JWT_AUDIENCE` remain reserved configuration fields for a future signed-token design and are not used by the current opaque-session implementation.

No secret is hard-coded.

The existing general rate-limit configuration remains the extension point for authentication abuse protection. A homemade in-memory authentication throttle was not introduced.

## Database

Migration `0005_phase_3_1_admin_authentication.sql`:

- adds `admins.password_hash`
- adds `admins.last_authenticated_at`
- creates `admin_sessions`
- adds unique token-hash constraints
- adds administrator and expiration indexes
- preserves existing Admin records and all Phase 2 relationships

Existing administrators receive no invented credentials.

## Security boundary

The authentication layer does not implement:

- admin Android UI
- Google OAuth
- managed-device enrollment/pairing
- realtime channels
- device commands
- location
- camera/microphone
- screen sharing
- app/website blocking
- device restrictions
- remote policies
- covert monitoring or security bypasses

Future Android clients must store received credentials using platform secure storage and communicate over HTTPS. urlOWASP Mobile Application Security guidancehttps://cheatsheetseries.owasp.org/cheatsheets/Mobile_Application_Security_Cheat_Sheet.html


## Phase 3.2 — Authentication Hardening

Phase 3.2 preserves the Phase 3.1 opaque-session architecture and hardens its security boundary.

### Authorization boundary

Authentication remains centralized in the Bearer middleware. A separate reusable administrator-authorization middleware now requires an authenticated ACTIVE administrator before protected administrator resources execute. No client-supplied adminId, userId, role, or isAdmin field is consulted.

### Account status

The authentication service reads the administrator record from PostgreSQL during every access-token validation and refresh. DISABLED administrators therefore cannot continue using an already-issued session.

### Request validation

Login and refresh payload schemas are strict and reject unexpected properties. Login passwords must meet the existing 15–256 character password policy before authentication work begins.

### Abuse protection

Login and refresh use the existing rate-limit configuration through express-rate-limit. The baseline is 10 requests per 15 minutes per direct network peer. Production requires the limiter to be enabled.

The default limiter store is process-local. Multi-instance production deployments must add a shared store or an equivalent trusted edge/API-gateway control. The backend does not claim distributed rate limiting.

### Password verification hardening

Persisted scrypt hashes are accepted only with the backend's supported N/r/p parameters and expected salt/key sizes. This prevents attacker-controlled or accidentally corrupted stored parameters from selecting an unexpectedly expensive or incompatible verification workload.

### Revocation and rotation

Logout revokes the server-side session. Refresh rotation uses an atomic compare-and-update operation against the current refresh-token hash, so an already-rotated refresh token cannot authenticate again.

### Error and information disclosure

Authentication failures remain generic. Password hashes, opaque credentials, database errors, stack traces, and internal paths are excluded from API responses and structured logging.

### Deferred

No managed-device enrollment, pairing, device registration, realtime communication, WebSockets, FCM, monitoring, location, camera, microphone, audio, screen sharing, application blocking, website blocking, device locking, remote commands, or remote policies are implemented by Phase 3.2.
