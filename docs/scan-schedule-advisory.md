# Advisory booking schedule on QR verification

Scope: gallery-org Protocol/admin booking scan only.

- A freshly verified confirmed booking with remaining guests succeeds even when the server-observed Baghdad date or time differs from its scheduled visit.
- Success carries a note containing the original booking date and time window. The scanner passes this note into the full-screen booking details; it is informational and does not trigger an error tone.
- Cancelled, unknown, malformed, fully used and unauthorized scans retain their existing outcomes. Network failures remain connection errors. Scan deduplication, verification-before-success, and original booking data are preserved.
- No booking/check-in is written by scanning. Existing arrival permissions, including the administrative requirement for arrival outside the booking date, remain enforced by the server/database. No SQL, RLS or Authentication changes.

Verification: 24 protocol-alert tests passed, including past/future dates, before/after the time window, exact start/end boundaries, valid in-window scans and existing rejection/network/deduplication behavior. ESLint and production build checked. A physical camera and authenticated production scan were not exercised.
