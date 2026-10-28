import type { NextConfig } from "next";
import { exhibitionSupabase } from "./src/config/supabase-public";

const nextConfig: NextConfig = {
  // .env.local is intentionally ignored by Git. Supply only the verified public
  // identity when deployment variables are absent; explicit configuration still
  // passes through the existing fail-closed runtime guard. Never add server secrets here.
  env: {
    ...(process.env.NEXT_PUBLIC_SUPABASE_URL === undefined
      ? { NEXT_PUBLIC_SUPABASE_URL: exhibitionSupabase.url } : {}),
    ...(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === undefined
      ? { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: exhibitionSupabase.publishableKey } : {}),
    ...(process.env.SUPABASE_EXPECTED_PROJECT_REF === undefined
      ? { SUPABASE_EXPECTED_PROJECT_REF: exhibitionSupabase.projectRef } : {}),
  },
  outputFileTracingIncludes: {
    '/api/sales/photo/*': ['./public/images/**/*'],
    '/api/admin/artworks/photo/*': ['./public/images/**/*'],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
