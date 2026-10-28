# Full-screen scan and phone audio — 2026-10-28

Project: C:\HOA-SYSTEM\gallery-org
Deployment: https://abaad-gallery-76mm.vercel.app/

- Scan opens a native full-viewport dialog with rear camera video filling the viewport. A small aiming frame and close button replace the embedded camera card. Camera tracks are stopped/destroyed after a decoded frame or when closing; camera setup failures remain camera errors.
- The existing fresh protected verification request still determines acceptance. During that request a loading circle is shown. Confirmed acceptance displays a green check for 650 ms, then opens the exact booking in a full-screen details view. No list search or manual row selection is required.
- Details use the freshly verified snapshot until the list cache contains an equally recent or newer row. Existing arrival confirmation remains explicit; scanning never writes attendance.
- Unknown/malformed codes display a red cross and then a short mismatch screen with rescan/back controls. Cancelled/consumed/wrong-date/access-denied codes retain their actual reason. Offline/server/timeout responses display a connection page and never claim a barcode mismatch. Closing cancels verification and pending automatic navigation.
- Starting a deliberate new scan resets the frame cooldown while retaining the in-flight gate; repeated frames cannot submit another verification. Returning from background or another interruption resumes AudioContext from the scan/notification button gesture, while saved mute remains respected.
- Tones now use a soft triangle waveform with gain 0.16 instead of the previous sine waveform/gain 0.055. An explicit Test sound button schedules an audible sample; enabling sound also tests it. This checks the actual audio engine rather than assuming that the displayed running state means the physical speaker is audible. Queuing, deduplication, browser autoplay restrictions and per-employee local preference remain in place. No library or media download was added.

Files changed
- src/components/bookings/{BookingDashboard,BookingDetails,QrReader,SoundControl}.tsx
- src/components/bookings/ScanScreen.tsx (new)
- src/components/protocol/ProtocolDialog.tsx (optional full-screen mode; other dialogs unchanged)
- src/lib/audio/{controller.ts,useProtocolSounds.ts}
- src/lib/bookings/scan.ts
- tests/protocol-alerts.test.mjs
- tests/scan-screen.test.mjs (new)

Validation
- Full unit suite: 227 passing tests, including new screen transition, cancellation, camera markup, intentional rescan, sound test, interrupted context, saved mute and stale-cache protection cases.
- Existing protected RPC/HTTP integration suite: seven passing isolated database checks. No production SQL, arrivals, staff/Auth settings or RLS changes.
- TypeScript, ESLint and production build checked before deployment.
- Physical camera decoding, volume/output routing and actual listening on the user's phone were not tested. Browser tests with fake audio nodes and component rendering are not a substitute for real device acceptance. Use Test sound on the phone and verify its media volume if no tone is audible. No workaround overrides hardware mute or browser sound restrictions.

References checked
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- https://github.com/nimiq/qr-scanner
