// Supabase → Project Settings → API. Set as Vercel env vars VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// (or paste directly here). Both are safe to be public — security is enforced by row-level security in schema.sql.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'REPLACE_ME';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'REPLACE_ME';
