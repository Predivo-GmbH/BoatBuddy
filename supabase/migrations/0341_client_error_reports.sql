-- Errors a member was shown on screen, reported by report-client-error (Roger 08.11.2026: the
-- person who hits an error is told at once that we noticed and are on it).
-- Contract: C:/Business/Audits/CONTRACT-customer-error-message-2026-11-08.md, section 1.
--
-- WHY 0341 AND NOT 036. apply-migrations.mjs defers the first release-gated migration
-- (035_revoke_anonymous_access.sql, gate member-frontend-live, off) AND every migration after it.
-- Numbered 036 this table would wait for release 2, and every report would answer 503. Files
-- apply in name order, and "0341_" sorts before "034_" and "035_", so this applies now in every
-- environment. It depends on nothing in 033-035 and 035 does not touch it (no anonymous right
-- exists here for its guard to find).
--
-- Smallest table that does the job: one row per report, written only by the function through
-- the service role, read only by the service role. No browser role can read or write it. The
-- user id is stored when the person was signed in; never an e-mail address (the function also
-- removes addresses, tokens and long random strings from `message` before it gets here).
begin;

create table public.client_error_reports (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^E-[A-Z2-9]{6}$'),
  created_at timestamptz not null default now(),
  area text not null check (area in ('money', 'signin', 'other')),
  screen text not null check (screen ~ '^[A-Za-z0-9_./:-]{1,60}$'),
  action text not null check (action ~ '^[A-Za-z0-9_./:-]{1,60}$'),
  status integer check (status between 0 and 599),
  message text not null check (char_length(message) <= 500),
  app_version text check (char_length(app_version) <= 40),
  user_id uuid
);
create index client_error_reports_created_at on public.client_error_reports (created_at desc);

alter table public.client_error_reports enable row level security;
revoke all on table public.client_error_reports from public, anon, authenticated;
grant select, insert on table public.client_error_reports to service_role;

comment on table public.client_error_reports is
  'Server errors shown to a member, one row per report from report-client-error. Service role only.';

commit;
