-- Server-side rate limit for the extract-expense edge function.
--
-- extract-expense is anon-callable with the public publishable key (BoatBuddy's
-- DB is anon-open by design) and fires TWO paid Anthropic passes per call, so a
-- leaked key could burn the AI budget. The earlier defence was a frontend
-- shared-secret header (EXTRACT_SECRET / VITE_EXTRACT_SECRET) — but Vite never
-- inlined the build var, so the guard broke uploads and was removed.
--
-- This replaces it with a pure server-side counter: no frontend dependency, so
-- it cannot break uploads. The edge fn keys by client IP into UTC-aligned window
-- buckets and enforces:
--   * max 30 calls / IP / hour   (bucket_key = 'ip:<addr>', window = hour start)
--   * max 300 calls / day global (bucket_key = 'global',    window = day start)
-- On exceed the fn returns HTTP 429 BEFORE any Anthropic call. The check
-- fails-OPEN (fn allows the call and logs) if the RPC errors, so an infra hiccup
-- never blocks a legit upload.

-- Counter table. One row per (bucket_key, window_start); count is the running
-- total for that window. Old rows are harmless (never re-hit once the window
-- passes) and can be pruned by a housekeeping job if ever needed.
create table if not exists public.extract_rate_limit (
  bucket_key   text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (bucket_key, window_start)
);

-- No direct client access: RLS on, zero policies = deny all for anon/authenticated.
-- The RPC below is SECURITY DEFINER (runs as owner) and bypasses this; service_role
-- also bypasses RLS. Nothing else can read or write the counters.
alter table public.extract_rate_limit enable row level security;
revoke all on table public.extract_rate_limit from anon, authenticated;

-- Atomic increment: upsert the (key, window) row and return the NEW count in one
-- statement, so concurrent calls can't race past the limit.
create or replace function public.bump_extract_rate(p_key text, p_window timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.extract_rate_limit (bucket_key, window_start, count)
  values (p_key, p_window, 1)
  on conflict (bucket_key, window_start)
    do update set count = public.extract_rate_limit.count + 1
  returning count into v_count;
  return v_count;
end;
$$;

-- EXECUTE granted to service_role ONLY (the edge fn uses the service-role client).
-- Explicitly revoke from public/anon/authenticated so a browser caller can't poke it.
revoke all on function public.bump_extract_rate(text, timestamptz) from public, anon, authenticated;
grant execute on function public.bump_extract_rate(text, timestamptz) to service_role;
