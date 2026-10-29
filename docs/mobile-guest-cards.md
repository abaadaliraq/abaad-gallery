# Mobile guest cards and filters

Scope: gallery-org guest list below 640px only. No guest records, attendance actions, permissions or database settings changed.

Correction: the initial preview loaded raw CSS and missed the project's global Tailwind Turbopack loader behavior for CSS Modules. The module export names did not match the emitted global selectors in the real app. The fix uses explicit protocol-guest-* names from a TypeScript mapping and loads their global stylesheet from the root layout, preserving the existing Tailwind configuration. Verified on the user's authenticated localhost:3000/protocol page in Edge at 339px: actual guest photos appear above names in two columns and all three filters share one row. No arrival buttons were pressed. A post-build integration check verifies all 11 names exist in both the real client JS and emitted CSS; run npm run build then npm run test:guests:css. The earlier raw-CSS preview alone was insufficient proof of application behavior.

- Two cards per mobile row, square photo above name/title/badges and existing arrival action below. Full names and confirmed titles wrap without truncation. Review-required title behavior remains unchanged.
- Card photos request suitable higher-resolution variants through the existing authenticated photo proxy. Detail and compact-photo variants are unchanged; memo comparison includes the new card variant.
- Category, attendance and priority occupy one row. Lighter label/input weights, smaller spacing and shorter search placeholder. Native selects and search retain 16px text and 44px touch height.
- Desktop card direction and photo dimensions remain unchanged.

Verification: 40 existing Protocol tests, ESLint and Production Build (including TypeScript) passed. Local SSR preview used actual list/card/filter/search/photo components, generated build CSS and synthetic silhouette images. Only the check-in button was replaced with a non-mutating preview button. At 339px photo width was about 125px and at 390px about 151px, compared with the previous 56px mobile photo. Filters had identical top coordinates and document width matched viewport at both sizes. At 1280px card direction remained row and photo size remained about 96px. No production check-in, guest edit or private photo request occurred during preview. Authenticated physical-phone acceptance was not performed.
