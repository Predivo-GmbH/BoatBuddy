-- SR-SB-02/03: native Auth membership, unchanged shared boat permissions.
-- Roger: "Server checks shared pw", 2026-11-04. One atomic cutover.
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

-- Remove column as well as table privileges: REVOKE ALL ON TABLE alone does
-- not undo 033's column grants. Drop all previous policies on the inventory,
-- including permissive TO PUBLIC policies which otherwise OR with new rules.
do $$
declare t text; c record; p record;
begin
  foreach t in array array[
    'beitraege','ausgaben','kontostand_snapshots','reservierungen','gastsessions',
    'nutzungslogs','boot_stats','eigentuemer','abrechnung_config','wartung',
    'gentleman_rules','ferien','changelog','phone_upload_sessions'
  ] loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    for c in select attname from pg_attribute where attrelid = ('public.' || t)::regclass
      and attnum > 0 and not attisdropped loop
      execute format('revoke all (%I) on public.%I from public, anon, authenticated', c.attname, t);
    end loop;
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy members on public.%I to authenticated using ((select boatbuddy_private.is_member())) with check ((select boatbuddy_private.is_member()))', t);
  end loop;
end $$;

-- Unused archive remains inaccessible to both browser roles; remove its old
-- permissive policy as well so a later grant cannot accidentally reopen it.
drop policy if exists anon_all on public.tanken;

revoke execute on function public.adjust_gesamtstunden(numeric),
  public.create_nutzungslog_atomic(date,text,numeric,numeric,jsonb,text,jsonb,numeric,uuid),
  public.delete_nutzungslog_atomic(uuid), public.delete_changelog_cascade(uuid)
  from public, anon, authenticated;

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
-- Completion is now service-only through the token-scoped phone-upload handler.

grant execute on function public.adjust_gesamtstunden(numeric),
  public.create_nutzungslog_atomic(date,text,numeric,numeric,jsonb,text,jsonb,numeric,uuid),
  public.delete_nutzungslog_atomic(uuid), public.delete_changelog_cascade(uuid) to authenticated;


-- QR tokens are capabilities: only members mint them, lifetime at most ten
-- minutes, no client-selected completed state or path. Anon gets NO table grant.
alter table public.phone_upload_sessions alter column expires_at set default (now() + interval '10 minutes');
-- Pending pre-cutover tokens were readable/mintable by anon. A rescan creates a
-- member-issued capability; old rows are retained for history, never reused.
update public.phone_upload_sessions set status = 'expired' where status = 'pending';
drop policy members on public.phone_upload_sessions;
create policy member_upload_read on public.phone_upload_sessions for select to authenticated
  using ((select boatbuddy_private.is_member()));
create policy member_upload_create on public.phone_upload_sessions for insert to authenticated
  with check ((select boatbuddy_private.is_member()) and token ~ '^[0-9a-f]{32}$'
    and status = 'pending' and storage_path is null and uploaded_at is null
    and expires_at > now() and expires_at <= now() + interval '10 minutes');
grant select, update on public.phone_upload_sessions to service_role;

-- Storage metadata permissions stay platform-owned; policies scope all access
-- to this private bucket and members. Public phone clients upload via the edge
-- function, never via Storage APIs and never through a readable signed URL.
drop policy if exists "Anon can upload phone photos" on storage.objects;
drop policy if exists "Anon can read phone uploads" on storage.objects;
drop policy if exists "Anon can upload invoices" on storage.objects;
drop policy if exists "Anon can read invoices" on storage.objects;
create policy member_receipt_read on storage.objects for select to authenticated
  using (bucket_id = 'dokumente' and (select boatbuddy_private.is_member()));
create policy member_receipt_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'dokumente' and (select boatbuddy_private.is_member()));
create policy member_receipt_delete on storage.objects for delete to authenticated
  using (bucket_id = 'dokumente' and (select boatbuddy_private.is_member()));

-- The helper is deliberately in an unexposed schema. No new definer RPC is
-- exposed to browsers, and the four business RPCs remain SECURITY INVOKER.
do $$
begin
  if exists (
    select 1 from pg_class c where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r','p') and
      (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
       or has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE'))
  ) then raise exception '034: anonymous table rights remain'; end if;
  if exists (
    select 1 from pg_policies where schemaname in ('public','storage')
      and (roles && array['anon','public']::name[])
  ) then raise exception '034: anonymous policies remain; review unexpected policies'; end if;
end $$;
notify pgrst, 'reload schema';
commit;
