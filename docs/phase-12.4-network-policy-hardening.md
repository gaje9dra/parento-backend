# Phase 12.4 — Backend Network Policy Hardening

## Scope

This phase hardens the Phase 12.1 website/network-policy backend without implementing Android network enforcement. The backend remains authoritative for policy configuration, versions, assignments, desired/reported state, capability metadata, and synchronization metadata.

## Security and authorization

- Admin identity is always derived from the authenticated admin session.
- Admin policy reads and writes use the authenticated admin's ownership scope.
- Device-originated policy reads/reports use the authenticated device session's managed-device identity; request bodies cannot select another device.
- Device reports require an active enrollment and active operational state.
- Policy reports are checked against the reporting device's administrative scope.
- Existing revocation/session architecture remains authoritative; revoked devices cannot create new policy reports or commands.
- Existing command validation and database triggers continue to reject cross-admin/cross-device network-policy commands.

## Policy and rule semantics

- Only ALLOW and BLOCK actions are accepted.
- Domains are normalized server-side using the Phase 12.1 rules: lowercase, trimmed, optional leading *. only, no protocol/path/port, and valid DNS labels.
- Duplicate normalized domains are rejected.
- Rule ordering is deterministic: exact domains before wildcard domains; within each class BLOCK precedes ALLOW; domain and rule ID provide stable tie-breaking.
- Wildcards match subdomains only and never the apex domain.

## Versioning and synchronization

Policy updates remain optimistic-concurrency protected by expectedVersion and return a conflict when stale.

Desired policy state, reported device state, enforcement status, and command lifecycle remain separate. Creating, assigning, queuing, delivering, or acknowledging a command never represents enforcement success.

Device reports cannot move the authoritative state backwards:
- reports older than the current desired policy version are ignored;
- older report timestamps are ignored at the repository layer;
- the database migration adds a second ordering guard;
- future-dated device timestamps are rejected beyond the configured skew window.

Capability reports use the same server-side ordering rule, so an older capability observation cannot overwrite a newer one.

## Assignment and revocation

Assignments remain unique per managed device and are protected by database ownership/status triggers. Disabled policies cannot be newly assigned. Revoked or inactive devices cannot receive new policy commands.

Policy disable/re-enable and version changes continue to update desired synchronization state through the existing Phase 12.1 database propagation trigger.

## Rate and resource limits

The existing rate-limit middleware is reused for both device and administrative network-policy endpoints with separate identifiers/messages. Existing request-body limits and the configured maximum network-policy rule count remain in force.

## Database hardening

Migration 0021_phase_12_4_network_policy_hardening.sql adds database-level protection against out-of-order synchronization/capability report timestamps and indexes the report timestamps used for freshness-oriented queries. No destructive migration or database reset is introduced.

## Realtime and privacy boundary

Phase 12 network policy does not introduce an administrative event-stream system. Device realtime continues to use the existing authenticated device-session command transport and does not expose browsing data.

The backend does not collect visited URLs, browsing history, DNS query history, page contents, cookies, credentials, decrypted TLS traffic, or packet captures. Network-policy events contain policy/enforcement metadata only.

## Client compatibility

The existing /api/v1 paths, Phase 12.1 request/response shapes, command names, status values, and capability values are preserved. No changes are made to parento-admin or parento-managed.

## Verification

Run the repository's supported verification suite:

npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run audit

Phase 12.4 must not be considered complete until CI and the repository-supported verification commands pass.