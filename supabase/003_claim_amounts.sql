-- 003: what you actually spent on a gift (optional; overrides the list price in your totals).
alter table public.claims add column if not exists amount numeric;
