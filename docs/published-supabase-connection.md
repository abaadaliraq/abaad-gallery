# Published Supabase connection — 2026-10-28

Target: https://abaad-gallery-76mm.vercel.app/ ; Supabase pwlwelxnrrignapdsyiw.

The mobile screenshot showed the setup error returned before signInWithPassword. A read-only production probe of /protocol confirmed a streamed redirect to /?notice=setup. This is deployment configuration, not a device-specific password error.

next.config.ts now supplies the approved project URL, active publishable key and expected project reference only when their deployment environment variables are absent. These public defaults are in src/config/supabase-public.ts. The publishable key was verified through the Supabase connector; it is designed for public application configuration and is not a service-role/administrative secret. No .env file, passwords, access tokens or administrative keys were added to Git.

Explicit environment variables remain authoritative, including blank or invalid values. src/lib/supabase/config.ts still rejects administrative keys, invalid URLs and mismatched project references. Server session verification, staff roles, live session checks, RLS and HttpOnly/Secure/SameSite cookies remain unchanged. There are no database or Auth-setting mutations.

Tests: five deployment configuration cases cover missing env defaults, administrative-key rejection, blank explicit configuration, mismatched project and existing environment precedence. Existing authentication/security tests remain included in the full unit suite. TypeScript, ESLint and production build are checked before publishing.

A deployment built from the repository no longer depends on the ignored local .env.local to discover the verified public Supabase project. Additional integrations such as Cloudinary still use their separate existing environment settings.
