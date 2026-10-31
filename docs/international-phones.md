# International visitor phones

Target: Supabase `pwlwelxnrrignapdsyiw`, gallery-org and the booking website. Both applications now accept an explicit international `+` or `00` prefix and 7–15 digits with a nonzero first digit. This is a format check, not verification of a country's numbering plan or of ownership/reachability.

Arabic/Persian digits, spaces, parentheses, dots and hyphens normalize to Western-digit international notation. Iraqi `07xxxxxxxxx` and `964...` inputs remain supported. Foreign local numbers require their country code; the application never guesses another visitor's country.

The owner must execute `supabase/international-phones.review.sql` once in the correct project. Identical copies exist in both repositories, but they target the same database and need only one execution. No production SQL has been executed by the agent.

The SQL broadens only the two existing phone constraints and the phone expressions in `booking_create` and `booking_visitor_save`. It also extends `00` search normalization in `booking_snapshot`. It preserves all other function code, signatures, grants, role/session guards, capacity limits, dates and idempotency checks. It does not update or reformat stored data. The script tolerates repeat execution and aborts transactionally if expected validation expressions have changed.

Tests cover format validation in both projects; a PGlite integration covers eight foreign numbering examples through website creation, person arrivals, door creation and `00` search. It verifies preserved existing bookings, phone values, counts and staff, safe repeat execution, and access/malformed-input rejection. Live production entry with a foreign phone remains pending until the owner applies the SQL. No real registrations or credentials were changed during testing.
