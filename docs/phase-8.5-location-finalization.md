# Phase 8.5 — Location System Finalization

## Final backend contract

Repository: gaje9dra/parento-backend

Phase 8 is a current-location system only. The backend stores one current
location row per ManagedDevice and does not expose location history.

## Reporting

Endpoint:

POST /api/v1/device/location

Authentication:

Bearer managed-device communication session.

The authenticated session supplies the ManagedDevice identity.

Example request using synthetic coordinates:

```json
{
  "reportId": "33333333-3333-4333-8333-333333333333",
  "availability": "AVAILABLE",
  "latitude": 26.9,
  "longitude": 75.8,
  "accuracyMeters": 12,
  "observedAt": "2026-09-25T10:00:00.000Z"
}
```

For AVAILABLE reports, latitude and longitude are required. For UNAVAILABLE
reports, coordinates and accuracy must be omitted/null according to the
request schema.

The backend assigns receivedAt and rejects observedAt values more than five
minutes ahead of backend time.

A report with an older observedAt cannot replace a newer current state. An
exact retry of the same reportId and report contents is a safe no-op. Reusing
a reportId with different report data returns a stable 409 conflict.

## Reporting response

Accepted current-state update:

```json
{
  "data": {
    "accepted": true,
    "location": {
      "managedDeviceId": "11111111-1111-4111-8111-111111111111",
      "availability": "AVAILABLE",
      "latitude": 26.9,
      "longitude": 75.8,
      "accuracyMeters": 12,
      "observedAt": "2026-09-25T10:00:00.000Z",
      "receivedAt": "2026-09-25T10:00:01.000Z",
      "reportId": "33333333-3333-4333-8333-333333333333"
    },
    "freshness": "FRESH"
  },
  "requestId": "synthetic-request-id"
}
```

An older report returns accepted=false and the authoritative current state.

## Admin retrieval

Endpoint:

GET /api/v1/devices/{deviceId}/location

Authentication:

Bearer Admin access token.

Authorization:

The requested ManagedDevice must belong to the authenticated Admin and must be
readable through the existing Admin authorization boundary.

Example response:

```json
{
  "data": {
    "location": {
      "managedDeviceId": "11111111-1111-4111-8111-111111111111",
      "availability": "AVAILABLE",
      "latitude": 26.9,
      "longitude": 75.8,
      "accuracyMeters": 12,
      "observedAt": "2026-09-25T10:00:00.000Z",
      "receivedAt": "2026-09-25T10:00:01.000Z",
      "reportId": "33333333-3333-4333-8333-333333333333"
    },
    "freshness": "FRESH"
  },
  "requestId": "synthetic-request-id"
}
```

When no state has ever been reported, location is null and freshness is
NEVER_REPORTED. An UNAVAILABLE current state is returned as UNAVAILABLE with
null coordinates and freshness UNKNOWN.

## Freshness

Freshness is derived centrally from server time and observedAt:

- FRESH: observedAt age <= 5 minutes
- STALE: age > 5 and <= 30 minutes
- VERY_STALE: age > 30 minutes
- UNKNOWN: current state exists but availability is UNAVAILABLE
- NEVER_REPORTED: no current state exists

## Validation and errors

The backend rejects:

- malformed request shapes
- invalid report UUIDs
- non-finite coordinates
- latitude outside -90..90
- longitude outside -180..180
- coordinate precision above 7 decimal places
- invalid/non-finite accuracy
- accuracy outside 0..100000 meters
- coordinates on UNAVAILABLE reports
- invalid timestamps
- timestamps more than five minutes in the future
- unauthorized or revoked device sessions
- Admin requests for devices owned by another Admin

The standard error response contains an error code, safe message, and
requestId. It never exposes SQL errors or stack traces.

Relevant location-specific codes include:

- INVALID_LOCATION_COORDINATES
- INVALID_LOCATION_ACCURACY
- INVALID_LOCATION_TIMESTAMP
- LOCATION_REPORT_ID_CONFLICT
- DEVICE_SESSION_INVALID
- DEVICE_AUTHORIZATION_DENIED
- AUTHORIZATION_DENIED
- DEVICE_NOT_FOUND
- RATE_LIMITED

## Security and privacy

- Existing device-session authentication is reused.
- Existing Admin authentication/authorization is reused.
- No client-provided device ID is trusted as the reporting identity.
- Enrollment and operational status must be ACTIVE for reporting.
- Revoked devices cannot update location.
- Current location is one row per ManagedDevice.
- No unlimited location history is stored.
- Exact coordinates are not routinely logged.
- No second realtime transport is introduced for location.
- Location endpoints use the configured rate limit when enabled.
- Database constraints provide defense in depth for coordinate validity and NaN values.

## Realtime

No realtime location event contract exists in the current backend. Location
uses authenticated HTTP reporting and retrieval. The existing realtime
boundary remains unchanged.

## Out of scope

Phase 8.5 does not add:

- location history
- geofencing
- route tracking
- location analytics
- camera or microphone access
- screen capture/sharing
- application or website blocking
- device locking
- remote wipe
- arbitrary code or shell execution
- covert surveillance
- permission bypass
- iOS support
- Phase 9+ functionality
