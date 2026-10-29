# Wissam miniature photos and prices

Scope: `C:/HOA-SYSTEM/gallery-org`, Supabase `pwlwelxnrrignapdsyiw`, exhibition `naima-baghdad-2026`.

13 supplied Cloudinary JPEGs were verified with HTTP 200 image/jpeg. Numbered source filenames 1–12 map to MIN-001–MIN-012. The unnumbered `mini-_ivvpql.jpg` maps to MIN-013. These are inventory numbers, not artistic titles. Titles and dimensions remain NULL.

Prices were assigned arbitrarily within the owner's IQD 600,000–1,500,000 range and persisted in `imports/wissam-miniatures.json`. They do not change on refresh or script re-execution.

Run **only** `supabase/wissam-miniatures.review.sql` in the project's Supabase SQL Editor. Production SQL has deliberately not been executed by the agent; the owner requested manual execution. Do not rerun the original Wissam import, which represents the older catalog.

The SQL replaces two existing functions without changing their signatures, grants, authentication, RLS, or session/exhibition guards:

- `sales_collection_snapshot`: an image and approved price are sufficient for a nameless miniature to appear to Sales. The previous complete-catalog eligibility branch remains supported.
- `wissam_sale_readiness`: an approved price and image are required for miniature availability. It no longer requires invented dimensions or titles.

It updates 13 existing entries, approves them for sale and writes administrative status history without impersonating staff. It never creates artwork/artist rows. It aborts on identity/photo/price conflicts, sold/reserved records, and shared exhibition records. Re-execution is a no-op. The other 10 miniatures stay unchanged and hidden from Sales until supplied with real photos and prices; Admin retains all 23.

UI: miniature cards show image, inventory number, and Western-digit price, with image in details. Existing responsive grid and authorized image proxy are reused.

Validation: `node tests/wissam-miniatures.database.mjs` covers rollback, Admin/Sales visibility, authenticated image-reference RPC, fixed prices, NULL metadata, idempotence, access denials, preserved unrelated records, readiness enforcement and reservation protection. The reservation test runs only in PGlite, never production. 28 unit tests, ESLint, TypeScript and production build passed. Physical phone and live production miniature display remain unverified until the owner applies the SQL.
