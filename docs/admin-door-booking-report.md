# Existing door registrations in Administration

Read-only production investigation on `pwlwelxnrrignapdsyiw` found 31 `walk_in` bookings with 31 arrivals, 36 website bookings with 6 arrivals, and 37 individual visitor profiles at inspection time. These counts are observations, not values hardcoded in the interface.

The old Overview and Activity paths read opening invitations and artwork events. Door bookings were already saved correctly in `exhibition_bookings`; they were not opening invitations. No missing visitors were recreated or copied into guest tables.

The Overview now has a separate booking summary: bookings, expected visitors, arrivals, and arrivals from the door. The old guest counters are explicitly labelled opening guests. The guest page links to booking/visitor records. Booking administration can filter website versus door records across all pages and shows the source on each booking. Individual names, addresses, phones and dates remain available in booking details through the existing visitor RPC.

Activity merges existing booking check-in events with opening attendance and artwork history, retaining the actual actor and event timestamp. Door arrival, website arrival, correction, cancellation and rescheduling have distinct labels and filters. Overview and Activity cache entries now depend on booking revision changes too.

The implementation only calls existing authorized `booking_snapshot` and `booking_events` RPCs using the current staff client. No SQL, RLS, grants, service keys, booking mutations or data backfills are needed. Ledger pagination is bounded to 100 pages and rejects duplicate/drifting pages. Event reads run in batches of six for at most 200 most recently updated relevant bookings; the UI explicitly reports truncation and partial read errors. Do not interpret a truncated historical activity result as an exhaustive audit export.

Validation: 73 Admin/live/filter/visitor unit tests and the PGlite integration test verify pagination, the 31/37 scenario using fixtures, source filtering, live invalidation, explicit failed-read states, existing role gates, actual scoped RPC output, actor names and no mutation of existing booking records. TypeScript, ESLint and production build passed. A signed-in production browser session was not available for visual confirmation; no live test visitors were created.
