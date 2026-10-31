# Door bookings and individual visitor data

Project: `C:/HOA-SYSTEM/gallery-org`; production target: `pwlwelxnrrignapdsyiw`. The booking website repository is unchanged.

## Activation

The owner must review and execute `supabase/booking-visitors.review.sql` once, in the correct project's SQL Editor. No production SQL or test visitors have been created by this work. The migration is transactional and aborts if the existing arrival function's expected guard has changed. It is an additive migration, not a seed to rerun repeatedly.

Before activation, the current count-only arrival UI remains available only when the server explicitly reports that the new RPC is missing. A network error is not treated as missing SQL. The new forms report that nothing was saved when setup is missing. After activation, new positive arrivals require a real visitor profile in the same transaction; no bulk count-only arrival bypass remains.

## User flows

- **حجز من الباب**: one person per submission; full name, Iraqi phone, address (city/area), today's Baghdad date and an open slot. Creates a canonical `exhibition_bookings` row with source `walk_in` and records the profile and attendance atomically. It retains the existing serial capacity lock, 60/hour and 200/day limits. No EmailJS delivery or artificial QR is generated for this already-present visitor.
- **زائر يدخل الآن** within booking details: fills one person's profile and adds exactly one arrival through the existing guarded check-in function. Owner name/phone are prefilled only for an unarrived booking and remain editable. Companions may share a guardian phone but must have their own names.
- **استكمال بيانات واصل**: fills the next missing profile for someone already included in the historical arrival count. It never increments attendance. No names, addresses or arrivals are fabricated for old rows.

Profiles appear in booking details with a booking-local person number, phone, address and actual visit date. They stay linked to the same group booking. Existing list search remains based on the original booking holder; profiles are viewed inside their booking.

The existing rule requiring Admin/reason for arrival outside the booking date remains. New entry dates are today's Baghdad date; completing an existing visitor allows an actual prior date within the exhibition. Existing negative Admin count corrections preserve historical profiles. If a correction would reuse an already-profiled person position, further entry is rejected for review rather than overwriting the profile or counting a person twice.

## Security and consistency

The new `exhibition_booking_visitors` table has forced RLS and revoked direct access for public/anon/authenticated/service_role. Narrow RPCs verify the live authorized Protocol/Admin session and exhibition membership before exposing or changing personal data. Existing Auth and RLS policies are unchanged.

Unique booking/person positions and same-day name/phone identities prevent accidental duplicate entries. Every record stores the server actor and timestamp. Frozen operation UUIDs make uncertain network retries idempotent. Known validation/setup errors unlock editing; ambiguous failures keep the original operation for retry. A different payload or actor cannot reuse the operation UUID. No historic booking, guest, artwork, arrival count, or identity is deleted or backfilled.

## Validation

- `node tests/booking-visitors.database.mjs`: local PGlite schema rollback; atomic creation/arrival; idempotence; group size; legacy completion without attendance changes; rollback on invalid data/duplicate visitors; old positive RPC bypass blocked; Admin correction preserved; direct reads and wrong roles denied; hourly/daily caps.
- `node --test tests/booking-visitors.test.mjs tests/visitor-entry-form.test.mjs`: required data/phone normalization, scoped API dispatch, origin rejection, setup/capacity errors, double-submit locking, uncertain retries and edit recovery for known missing migration.
- Existing Auth, toolbar, QR and audio tests pass. ESLint, TypeScript and production build pass.

Live production saves, physical phones/cameras, and real PostgreSQL multi-connection concurrency have not been exercised. No fake production records were created. The capacity and attendance critical sections share the existing PostgreSQL transaction advisory lock; local tests cover their state boundaries, not a real concurrent load test.
