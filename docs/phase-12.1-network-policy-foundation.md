# Phase 12.1 — Backend Website & Network Blocking Foundation

## Scope

This phase changes only gaje9dra/parento-backend. It establishes authoritative policy/control contracts for later Managed Android enforcement. It does not block traffic and does not implement VPN interception, DNS interception, packet inspection, TLS interception, certificate installation, traffic decryption, root firewalling, hidden APIs, or arbitrary commands.

## Domain model

network_policies are Admin-owned, versioned desired state. Each policy contains domain rules with domain, action (ALLOW or BLOCK), enabled state, rule ID, and timestamps.

Rules accept exact hostnames such as example.com and explicit leading-subdomain wildcards such as *.example.com.

Normalization is deterministic: trim whitespace, lowercase, preserve a leading *. only, reject all other wildcard characters, require at least two DNS labels, reject empty labels/control characters/URL paths/ports/schemes, and reject excessive label or hostname length.

Wildcard semantics are explicit: *.example.com matches www.example.com and deeper subdomains but does not match the apex example.com. Exact rules are more specific than wildcard rules. Duplicate normalized domains are rejected at policy write time. No executable rule content is accepted.

## Versioning and assignment

Policy updates require expectedVersion. The database locks the policy row and increments the authoritative version. Stale writes return conflict semantics.

Assignments are unique per ManagedDevice and are guarded by database triggers for Admin ownership, device enrollment/operational state, policy ownership, active policy status, and exact policy version.

## Desired / reported / enforcement

Synchronization state distinguishes desired policy/version, reported policy/version, enforcement status, last requested/reported timestamps, and a safe error code.

Supported enforcement states are UNKNOWN, PENDING, APPLIED, PARTIALLY_APPLIED, FAILED, UNSUPPORTED, STALE, and REVOKED. APPLIED is accepted only when the reported policy/version matches the current device assignment. Command delivery is not represented as enforcement success.

Admin status responses derive freshness as NEVER_REPORTED, FRESH, STALE, or VERY_STALE from existing monitoring thresholds.

## Capability reporting

Managed devices can report supported, mode (UNKNOWN, UNSUPPORTED, SUPPORTED), capabilityVersion, and reportedAt. The backend does not assume universal Android network-management support.

## Commands

The existing Phase 6 command system is extended with two allowlisted types: SYNC_NETWORK_POLICY and REQUEST_NETWORK_POLICY_STATUS. Both use the existing authenticated, device-scoped command transport, TTL, idempotency, status transitions, and command-event audit. Payloads are strictly structured and contain no executable content.

## Authorization

Admin operations use the existing Admin authentication/authorization middleware and device ownership checks. Managed-device reporting uses the existing authenticated device-session identity; a client-supplied device ID is not trusted for authorization.

Revoked/inactive devices cannot report policy status/capability and database triggers mark network synchronization REVOKED on device revocation.

## Audit and realtime

Important network-policy actions are stored in network_policy_events using IDs/references and bounded metadata; complete domain lists are not written to ordinary application logs.

The existing realtime architecture is reused indirectly through the existing command-delivery transport. The inspected repository has no separate Admin event-subscription channel, so Phase 12.1 does not introduce a second realtime system.

## API contract

The new API follows the existing /api/v1 response envelopes, authentication middleware, validation, rate limiting, pagination, and error handling. Admin routes cover policy CRUD, assignment/removal, effective policy, synchronization, enforcement status, and capability retrieval. Managed-device routes cover effective-policy retrieval, enforcement-status reporting, and capability reporting.

## Client compatibility

No parento-managed or parento-admin files are changed. The backend adds the future Managed-device contract for SYNC_NETWORK_POLICY, REQUEST_NETWORK_POLICY_STATUS, GET /api/v1/device/network-policy, POST /api/v1/device/network-policy/status, and POST /api/v1/device/network-policy/capability.

The existing Managed Android client must add support for these command names and payload/status enums before it can consume these commands. This phase intentionally stops short of changing that repository. No existing application-management client contract is changed.

## Retention

The network policy event table stores bounded security/audit references rather than complete policy payloads. Current policy and current synchronization/capability state are retained; no unbounded policy-history table is introduced.

## Enforcement boundary

This backend phase establishes policy and control state only. A policy existing, being assigned, or having a command delivered does not mean a website or network destination is blocked. Actual network restriction enforcement remains a later Managed Android phase using supported Android/network-management mechanisms.
