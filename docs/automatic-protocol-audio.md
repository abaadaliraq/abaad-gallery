# Automatic Protocol audio without controls

User policy: Protocol sounds are enabled by default, with no enable/mute/test bar.

- Removed SoundControl and its dashboard rendering.
- Workspace creates an always-on controller that ignores prior saved mute and does not write a new mute preference. Generic controller mode remains available for independent reuse/tests.
- Attempts Web Audio resume on mount without playing a test tone. Genuine pointer/touch/keyboard/click interaction retries synchronously; focus, pageshow and visible-page return retry interrupted contexts. Listeners and context are cleaned up on unmount/user change.
- Browser autoplay denial is respected. There is no silent-media workaround, fake ready state, replay of old blocked events or promise of sound before interaction on restricted devices. Device/system mute cannot be overridden.
- New booking, scan success and scan error sounds retain existing verification and duplicate/overlap protection.

Verification: 26 Protocol-alert tests passed (including automatic activation/cleanup, always-on ignoring stored off, blocked startup followed by a real gesture, no startup tone, no duplicate event playback), ESLint and Production Build/TypeScript passed. Refreshed the actual authenticated localhost:3000/protocol page and confirmed no enable/mute/test labels remain in its accessible UI. No production booking/check-in was created. Physical iPhone/Safari speaker output was not tested.
