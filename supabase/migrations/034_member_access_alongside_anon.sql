-- SR-SB-02/03, RELEASE 1 OF 2: member access ALONGSIDE the old anonymous access.
-- Roger: "Server checks shared pw", 2026-11-04.
--
-- ADDITIVE ONLY. Nothing the live (old) front end uses is removed here: every anon
-- grant, every anon policy and the anon Storage policies stay exactly as 033 left
-- them, so the old front end keeps working while the edge functions and the new
-- (member) front end go live, and keeps working if a later release step fails.
-- The anonymous revokes, the policy drops and the "no anonymous access" guard are
-- RELEASE 2: 035_revoke_anonymous_access.sql, which apply-migrations.mjs applies
-- only once this release's front end is live in that environment
-- (docs/RUNBOOK-member-gate.md).
begin;

create schema if not exists boatbuddy_private;
revoke all on schema boatbuddy_private from public, anon, authenticated;
grant usage on schema boatbuddy_private to authenticated;

-- Authoritative server metadata, not a stale JWT membership claim and never
-- raw_user_meta_data (which a signed-in caller can change). Future personal
-- accounts use the same membership flag; no table policies need replacing.
create function boatbuddy_private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select auth.role()) = 'authenticated'
    and (select auth.uid()) is not null
    and ((select auth.jwt())->>'exp')::numeric > extract(epoch from now())
    and exists (
      select 1 from auth.users u where u.id = (select auth.uid())
        and u.raw_app_meta_data @> '{"boatbuddy_member":true}'::jsonb
        and u.deleted_at is null
        and (u.banned_until is null or u.banned_until <= now())
    ), false);
$$;
revoke all on function boatbuddy_private.is_member() from public, anon, authenticated;
grant execute on function boatbuddy_private.is_member() to authenticated;

-- The authenticated role gets exactly the member rights below and nothing older.
-- Policies that also serve anon (TO anon, TO public, or TO anon, authenticated as
-- on changelog) are narrowed to anon, so the old front end keeps them and a
-- signed-in NON-member gets nothing through them. Policies for other roles only
-- are dropped. Release 2 drops the anon ones.
do $$
declare t text; c record; p record;
begin
  foreach t in array array[
    'beitraege','ausgaben','kontostand_snapshots','reservierungen','gastsessions',
    'nutzungslogs','boot_stats','eigentuemer','abrechnung_config','wartung',
    'gentleman_rules','ferien','changelog','phone_upload_sessions'
  ] loop
    execute format('revoke all on public.%I from authenticated', t);
    for c in select attname from pg_attribute where attrelid = ('public.' || t)::regclass
      and attnum > 0 and not attisdropped loop
      execute format('revoke all (%I) on public.%I from authenticated', c.attname, t);
    end loop;
    for p in select policyname, roles from pg_policies where schemaname = 'public' and tablename = t loop
      if p.roles && array['anon','public']::name[] then
        if p.roles <> array['anon']::name[] then
          execute format('alter policy %I on public.%I to anon', p.policyname, t);
        end if;
      else
        execute format('drop policy %I on public.%I', p.policyname, t);
      end if;
    end loop;
    execute format('alter table public.%I enable row level security', t);
    if t <> 'phone_upload_sessions' then
      execute format('create policy members on public.%I to authenticated using ((select boatbuddy_private.is_member())) with check ((select boatbuddy_private.is_member()))', t);
    end if;
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select on public.beitraege, public.ausgaben, public.kontostand_snapshots,
  public.reservierungen, public.gastsessions, public.nutzungslogs, public.boot_stats,
  public.eigentuemer, public.abrechnung_config, public.wartung, public.gentleman_rules,
  public.ferien, public.changelog, public.phone_upload_sessions to authenticated;
grant delete on public.beitraege, public.ausgaben, public.kontostand_snapshots,
  public.reservierungen, public.gastsessions, public.nutzungslogs, public.wartung,
  public.gentleman_rules, public.ferien, public.changelog to authenticated;

grant insert (fahrer,betrag,monat,notiz) on public.beitraege to authenticated;
grant insert (bezeichnung,betrag,kategorie,datum,notiz,bezahlt_von,dokument_pfad,verarbeitungs_status,treibstoff_liter) on public.ausgaben to authenticated;
grant update (bezeichnung,betrag,kategorie,datum,notiz,bezahlt_von,erstattet,erstattet_am,dokument_pfad,verarbeitungs_status,treibstoff_liter) on public.ausgaben to authenticated;
grant insert (betrag,datum,notiz) on public.kontostand_snapshots to authenticated;
grant insert (fahrer,datum,ganzer_tag,von_zeit,bis_zeit,notiz) on public.reservierungen to authenticated;
grant update (fahrer,datum,ganzer_tag,von_zeit,bis_zeit,notiz) on public.reservierungen to authenticated;
grant insert (gast_name,betrag,bezahlt_an,datum,notiz,auf_konto_eingezahlt) on public.gastsessions to authenticated;
grant update (gast_name,betrag,bezahlt_an,datum,notiz,auf_konto_eingezahlt,eingezahlt_am,eingezahlt_von) on public.gastsessions to authenticated;
grant insert (datum,fahrer,betriebsstunden,treibstoff_liter,aktivitaeten,notiz,teilnehmer,reservierung_id) on public.nutzungslogs to authenticated;
grant update (datum,fahrer,betriebsstunden,treibstoff_liter,aktivitaeten,notiz,teilnehmer,motorstunden_stand,reservierung_id) on public.nutzungslogs to authenticated;
grant update (gesamtstunden,startsaldo,kaufdatum,modell,motorstunden_grenze,notiz,aktualisiert_am) on public.boot_stats to authenticated;
grant update (fahrer,anteil_prozent,einstieg_datum,notiz) on public.eigentuemer to authenticated;
grant update (boot_marktwert,bewertung_datum,abschreibung_prozent,kuendigungsfrist_monate,beitrag_pro_monat,notiz,aktualisiert_am) on public.abrechnung_config to authenticated;
grant insert (bezeichnung,intervall_monate,naechstes_datum,zustaendig,notiz) on public.wartung to authenticated;
grant update (erledigt,erledigt_am) on public.wartung to authenticated;
grant insert (regel,sortierung) on public.gentleman_rules to authenticated;
grant update (regel,sortierung,aktiv) on public.gentleman_rules to authenticated;
grant insert (fahrer,von_datum,bis_datum,notiz) on public.ferien to authenticated;
grant update (fahrer,von_datum,bis_datum,notiz) on public.ferien to authenticated;
grant insert (datum,titel,beschreibung,kategorie) on public.changelog to authenticated;
grant update (datum,titel,beschreibung,kategorie) on public.changelog to authenticated;
grant insert (token,status) on public.phone_upload_sessions to authenticated;
-- Completion is service-only through the token-scoped phone-upload handler.

-- Members call the four SECURITY INVOKER business RPCs. The anon grant from 033
-- stays until release 2.
grant execute on function public.adjust_gesamtstunden(numeric),
  public.create_nutzungslog_atomic(date,text,numeric,numeric,jsonb,text,jsonb,numeric,uuid),
  public.delete_nutzungslog_atomic(uuid), public.delete_changelog_cascade(uuid) to authenticated;

-- QR tokens are capabilities: only members mint them through these policies,
-- lifetime at most ten minutes, set by the server clock, no client-selected
-- completed state or path. (The old anon policies stay until release 2.)
alter table public.phone_upload_sessions alter column expires_at set default (now() + interval '10 minutes');
create policy member_upload_read on public.phone_upload_sessions for select to authenticated
  using ((select boatbuddy_private.is_member()));
create policy member_upload_create on public.phone_upload_sessions for insert to authenticated
  with check ((select boatbuddy_private.is_member()) and token ~ '^[0-9a-f]{32}$'
    and status = 'pending' and storage_path is null and uploaded_at is null
    and expires_at > now() and expires_at <= now() + interval '10 minutes');
grant select, update on public.phone_upload_sessions to service_role;

-- member-session reads its wrong-password counter without spending an attempt.
grant select on public.extract_rate_limit to service_role;

-- Storage metadata permissions stay platform-owned; these policies scope member
-- access to this private bucket. The anon Storage policies stay until release 2.
create policy member_receipt_read on storage.objects for select to authenticated
  using (bucket_id = 'dokumente' and (select boatbuddy_private.is_member()));
create policy member_receipt_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'dokumente' and (select boatbuddy_private.is_member()));
create policy member_receipt_delete on storage.objects for delete to authenticated
  using (bucket_id = 'dokumente' and (select boatbuddy_private.is_member()));

notify pgrst, 'reload schema';
commit;
