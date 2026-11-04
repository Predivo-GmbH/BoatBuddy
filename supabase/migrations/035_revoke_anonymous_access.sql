-- release-gate: member-frontend-live
-- SR-SB-02/03, RELEASE 2 OF 2: remove the old anonymous access.
--
-- The line above is read by scripts/apply-migrations.mjs. This file is applied ONLY
-- when (a) supabase/release-gates.json enables "member-frontend-live" (a later PR
-- flips it) AND (b) the environment's LIVE site serves /release.json saying it is the
-- member build (release 1's front end). Until both hold, the run skips this file and
-- everything after it and says so; nothing is recorded, so a later run applies it.
-- Procedure: docs/RUNBOOK-member-gate.md.
begin;

-- Remove column as well as table privileges: REVOKE ALL ON TABLE alone does not
-- undo 033's column grants. Drop every remaining policy that serves anon or
-- PUBLIC; the member policies from 034 (TO authenticated) stay.
do $$
declare t text; c record; p record;
begin
  foreach t in array array[
    'beitraege','ausgaben','kontostand_snapshots','reservierungen','gastsessions',
    'nutzungslogs','boot_stats','eigentuemer','abrechnung_config','wartung',
    'gentleman_rules','ferien','changelog','phone_upload_sessions'
  ] loop
    execute format('revoke all on public.%I from public, anon', t);
    for c in select attname from pg_attribute where attrelid = ('public.' || t)::regclass
      and attnum > 0 and not attisdropped loop
      execute format('revoke all (%I) on public.%I from public, anon', c.attname, t);
    end loop;
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t
      and roles && array['anon','public']::name[] loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- Unused archive remains inaccessible to both browser roles; remove its old
-- permissive policy as well so a later grant cannot accidentally reopen it.
drop policy if exists anon_all on public.tanken;

revoke execute on function public.adjust_gesamtstunden(numeric),
  public.create_nutzungslog_atomic(date,text,numeric,numeric,jsonb,text,jsonb,numeric,uuid),
  public.delete_nutzungslog_atomic(uuid), public.delete_changelog_cascade(uuid)
  from public, anon;

-- Pending tokens from before the cutover were readable/mintable by anon. A rescan
-- creates a member-issued capability; old rows are retained for history, never reused.
update public.phone_upload_sessions set status = 'expired' where status = 'pending';

-- Public phone clients upload via the phone-upload edge function, never via Storage
-- APIs and never through a readable signed URL.
drop policy if exists "Anon can upload phone photos" on storage.objects;
drop policy if exists "Anon can read phone uploads" on storage.objects;
drop policy if exists "Anon can upload invoices" on storage.objects;
drop policy if exists "Anon can read invoices" on storage.objects;

-- The helper is deliberately in an unexposed schema. No new definer RPC is
-- exposed to browsers, and the four business RPCs remain SECURITY INVOKER.
do $$
begin
  if exists (
    select 1 from pg_class c where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r','p') and
      (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
       or has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE'))
  ) then raise exception '035: anonymous table rights remain'; end if;
  if exists (
    select 1 from pg_policies where schemaname in ('public','storage')
      and (roles && array['anon','public']::name[])
  ) then raise exception '035: anonymous policies remain; review unexpected policies'; end if;
end $$;
notify pgrst, 'reload schema';
commit;
