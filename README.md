# Gift Tree 🎄

Family Christmas lists without spoilers, plus Secret Santa.

- **Stack:** Vite + React, Supabase (magic-link auth + Postgres), one Vercel function for link previews.
- **The surprise rule** lives in the database (`supabase/schema.sql`): you can't read claims on gifts for you. The tree count and "peek" go through two narrow functions.
- **Secret Santa** draws one loop (A→B→C→…→A) server-side. Nobody draws themselves or their partner, and each person can only read their own match.

## Setup
1. Supabase → SQL Editor → paste `supabase/schema.sql` → Run.
2. Supabase → Authentication → URL Configuration: set Site URL to the app URL and add it to Redirect URLs.
3. Vercel env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Local dev: `npm install && npm run dev`.
