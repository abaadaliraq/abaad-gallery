# Mobile artwork sales refinement

Scope: gallery-org sales/artwork presentation below 640px only. No artwork prices, statuses, reservations, sales, Authentication or database changes.

- Two artwork cards per mobile row. Full square image area above title, measurements and price/status. object-contain preserves the full artwork. Photo proxy and local/Cloudinary sources remain unchanged; mobile image sizes now request suitable resolution instead of a 72px thumbnail.
- Hide code/artist repetitions from normal mobile cards; those facts remain available in details and on desktop. Mobile measurement labels omit only trailing .00 from whole-number measurements. Existing miniature price-only cards remain unchanged.
- Compact mobile header with sales title and logout icon. Desktop header retains the prior staff/exhibition content.
- Artist selection stays available through the existing artist buttons. Mobile search and status select share one row, replacing the nested filtering panel and duplicate mobile artist dropdown. Desktop filter controls remain available. Stats use Western digits.
- Explicit sales-mobile-* classes loaded by the root layout use the existing global Tailwind pipeline.

Verification: 20 sales tests, ESLint and Production Build/TypeScript passed. Post-build artifact check verified 11 guest and 16 sales style names exist in emitted CSS and client JS. Inspected the actual authenticated localhost:3000/sales page at 337px: real artwork photos appear in two columns with titles, measurements and prices underneath, search/status occupy one row and header is compact. No artwork details/status action, reservation or sale was submitted. The missing artwork photo retains its existing placeholder. Native-window control was stopped when user input was detected; no additional interactions were attempted.
