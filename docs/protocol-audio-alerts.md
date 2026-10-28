# Protocol audio alerts — 2026-10-28

Project: C:\HOA-SYSTEM\gallery-org
Supabase: pwlwelxnrrignapdsyiw

Implemented
- Shared Web Audio controller: new_booking (three soft notes), scan_success (short ascending notes), scan_error (short descending notes). One context, serial timeline, bounded burst backlog (scan feedback takes priority when saturated), deduplication for the mounted workspace lifetime. Muting cancels queued tones. Events observed while muted/blocked are not replayed later.
- Per-employee localStorage preference (only on/off, no names, QR tokens or booking data). Initial state never assumes autoplay is permitted. Activation calls AudioContext.resume directly from the button gesture. State changes, including suspension/interruption, update the displayed status. Unsupported browsers show an unavailable state.
- Existing bell counter now counts actual creations instead of updated_at changes. Toast displays guest name, date, time and party size. The bell retains session creation notices and the existing recent-update history.
- Existing protected booking RPC/API and shared LiveStore remain the transport. A canonical unfiltered subscriber shares the default list cache/request and existing revision polling. Filtered views use their own query plus this unfiltered subscriber, so notifications continue while searching or scanning. No new polling loop or Realtime channel is created. Backfill failures alone retry after five seconds.
- Creation detection uses the existing created_at and server observed_at, preserving Postgres microsecond precision. First snapshot is silent. A fixed session baseline and emitted-ID set prevent old updates, replays and reconnects from generating duplicate alerts. Existing paginated RPC reads backfill creations since the session baseline. This costs additional page reads for long sessions with more than 20 new bookings; a 500-page safety limit reports an error instead of assuming completeness.
- QR decoder submits one decoded frame and stops. Fresh no-store HTTP verification uses the existing token-hashing RPC path, not cached list results. Success requires one confirmed matching booking, remaining party places and today's date according to the server observation timestamp in Baghdad. Fully consumed, cancelled, unknown and wrong-date bookings are rejected with separate messages. Partial party arrivals remain valid under existing rules.
- QR verification only opens/filters the record. It never records attendance. Existing explicit arrival confirmation remains in BookingDetails and existing database rules remain authoritative. Timeout, malformed response, offline and server failure are connection errors, not evidence of an invalid QR. Concurrent/repeated frames are gated; intentional rescan is allowed after 2.5 seconds and reads current data again.
- No SQL, migration, RLS, staff permission, Auth, production booking, guest or sales changes. No new dependencies. Current Alexandria/Montserrat theme and desktop navigation retained; only the required small sound control and feedback messages were added.

Files
Modified:
- src/components/bookings/BookingDashboard.tsx — sound control, toast, bell notices and verified scan feedback.
- src/components/bookings/ProtocolWorkspace.tsx — employee ID for sound preference scope.
- src/components/bookings/QrReader.tsx — one-shot raw decoder result.
- src/lib/bookings/useBookings.ts — existing list + deduplicated creation notices.
- src/types/bookings.ts — existing created_at field in the TypeScript contract.
- tests/helpers/load-ts.mjs — timer globals for isolated audio-controller tests.
- package.json — test:protocol-alerts / test:protocol-alerts:db commands.
Added:
- src/lib/audio/controller.ts
- src/lib/audio/useProtocolSounds.ts
- src/components/bookings/SoundControl.tsx
- src/lib/bookings/notifications.ts
- src/lib/bookings/useBookingNotifications.ts
- src/lib/bookings/scan.ts
- tests/protocol-alerts.test.mjs
- tests/protocol-alerts.database.mjs
- docs/protocol-audio-alerts.md

Verification
- Read-only production inspection confirmed: zero bookings, no direct authenticated SELECT grant, zero booking RLS policies, no booking Realtime publication. This makes existing protected RPC polling the compatible choice without schema/security changes.
- Unit tests cover silent initialization, creation vs edits, replay/reconnect, more than 20 creations, failed catchup/retry, absent creation evidence, microseconds and late commits after earlier reads; QR success only after fresh response, invalid/unknown/cancelled/consumed/wrong-day/partial-party codes, rapid duplicate scans, offline/server/malformed failures and access denial; audio activation, blocking, suspension, mute persistence, non-overlap, deduplication and unavailable audio controls.
- Seven isolated PGlite integration checks run the actual booking SQL and existing HTTP handler with Protocol database claims: creation detection, idempotency replay, valid/unknown QR, partial/full arrival and revoked exhibition membership. Production was not mutated.
- Existing booking database suite: 25 checks passed in isolated PGlite. This fixture serializes requests; it is not a multi-connection contention test.
- Final verification passed: 214 unit tests (19 new alert/audio cases), seven alert database integration checks, 25 existing booking database checks, npm run typecheck, npm run lint and npm run build.

Not performed
- Listening/volume quality on physical speakers, iPhone/Safari or Android; physical camera decoding; end-to-end authenticated browser visual/touch testing on desktop/mobile. Browser automation was unavailable in this session. Mock audio/context tests do not substitute for physical device testing.
- Live production booking arrival/QR tests: production contains zero bookings; no test bookings, slots or arrivals were written there.
- Realtime disconnect/reconnect: no Realtime subscription is used. Existing polling/cache replay and reconnect behavior are tested instead.
- Background/locked-screen delivery is not promised: existing polling pauses when the document is hidden, and mobile operating systems can suspend audio. Staff must keep the interface open and enable sound; notifications catch up on return.

Manual acceptance remaining
1. Open /protocol on desktop and phone, press تفعيل التنبيهات الصوتية, confirm the displayed state and gentle volume.
2. While the page remains open, create one authorized real booking from the existing booking system. Confirm one counter increment, toast, tone and list refresh. Edit that booking and confirm no new-booking tone.
3. Scan today's valid QR, unknown QR, cancelled QR and a fully consumed QR; confirm messages/sounds. Repeat frames rapidly, interrupt network and retry. Verify no arrival is written by scanning alone.
4. Mute, create a booking, confirm visual notice without audio; re-enable and confirm no historical tone. Background/restore the page and confirm no repeated alerts.

References
- https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume
- https://supabase.com/docs/guides/realtime/postgres-changes
