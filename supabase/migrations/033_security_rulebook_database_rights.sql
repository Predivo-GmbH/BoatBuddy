-- SR-SB-06/07/08/12: explicit database rights, preserving current callers.
-- See docs/DECISIONS.md for the shared-anon authorization limitation (SB-02/03).
-- One transaction: a failed assertion leaves the old working schema intact.
begin;

create schema if not exists extensions;
revoke create on schema public from public, anon, authenticated;

-- GraphQL's health callers now use the existing REST schema endpoint instead.
-- No CASCADE: an unexpected dependency must stop the release, not be destroyed.
drop extension if exists pg_graphql;
do $$
declare e record;
begin
  for e in select extname, extrelocatable from pg_extension
           where extnamespace = 'public'::regnamespace loop
    if not e.extrelocatable then
      raise exception '033: non-relocatable extension in public: %; review required', e.extname;
    end if;
    execute format('alter extension %I set schema extensions', e.extname);
  end loop;
end $$;

-- Prevent implicit grants from every current object/default-ACL owner in the
-- exposed schemas, including global defaults. Existing service_role ACLs stay.
do $$
declare owner_name text; schema_name text; object_kind text;
begin
  for owner_name in
    select distinct r.rolname from pg_roles r where r.oid in (
      select nspowner from pg_namespace where nspname in ('public', 'graphql_public')
      union select relowner from pg_class where relnamespace in
        (select oid from pg_namespace where nspname in ('public', 'graphql_public'))
      union select proowner from pg_proc where pronamespace in
        (select oid from pg_namespace where nspname in ('public', 'graphql_public'))
      union select defaclrole from pg_default_acl where defaclnamespace = 0 or defaclnamespace in
        (select oid from pg_namespace where nspname in ('public', 'graphql_public'))
      union select oid from pg_roles where rolname = current_user
    )
  loop
    foreach object_kind in array array['tables', 'sequences', 'functions', 'types'] loop
      execute format('alter default privileges for role %I revoke all on %s from public, anon, authenticated', owner_name, object_kind);
      for schema_name in select nspname from pg_namespace where nspname in ('public', 'graphql_public') loop
        execute format('alter default privileges for role %I in schema %I revoke all on %s from public, anon, authenticated', owner_name, schema_name, object_kind);
      end loop;
    end loop;
    execute format('alter default privileges for role %I revoke all on schemas from public, anon, authenticated', owner_name);
  end loop;
end $$;

-- Remove inherited/table/column ACLs before restoring the reviewed allow-list.
-- This also handles tables added out of band; no accidental browser exposure.
do $$
declare s text; t record; c record; f record;
begin
  for s in select nspname from pg_namespace where nspname in ('public', 'graphql_public') loop
    execute format('revoke create on schema %I from public, anon, authenticated', s);
    execute format('revoke all on all tables in schema %I from public, anon, authenticated', s);
    execute format('revoke all on all sequences in schema %I from public, anon, authenticated', s);
    execute format('revoke execute on all functions in schema %I from public, anon, authenticated', s);
    for t in select oid, relname, relkind from pg_class
             where relnamespace = s::regnamespace and relkind in ('r','p','v','m','f') loop
      for c in select attname from pg_attribute where attrelid = t.oid and attnum > 0 and not attisdropped loop
        execute format('revoke all (%I) on %I.%I from public, anon, authenticated', c.attname, s, t.relname);
      end loop;
      if t.relkind in ('r','p') then
        execute format('alter table %I.%I enable row level security', s, t.relname);
      elsif t.relkind = 'v' then
        execute format('alter view %I.%I set (security_invoker = true)', s, t.relname);
      end if;
    end loop;
    for f in select p.oid::regprocedure as signature from pg_proc p
             where pronamespace = s::regnamespace and prokind in ('f','p') loop
      -- Explicit pg_temp LAST prevents temp-table shadowing. Existing bodies
      -- reference public tables/helpers without qualification; empty would break them.
      execute format('alter routine %s set search_path = pg_catalog, public, pg_temp', f.signature);
    end loop;
  end loop;
end $$;

-- No browser schema creation or Vault access, including inherited PUBLIC rights.
do $$
declare s text;
begin
  for s in select nspname from pg_namespace
           where nspname not like 'pg_%' and nspname <> 'information_schema' loop
    execute format('revoke create on schema %I from public, anon, authenticated', s);
    execute format('revoke truncate, references, trigger on all tables in schema %I from public, anon, authenticated', s);
  end loop;
  if to_regclass('vault.decrypted_secrets') is not null then
    revoke all on vault.decrypted_secrets from public, anon, authenticated;
  end if;
end $$;

-- Trigger functions maintain derived changelog/source links and hour totals.
-- Only table triggers may invoke them; browsers cannot forge derived columns.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p
           where pronamespace = 'public'::regnamespace and prorettype = 'trigger'::regtype loop
    execute format('alter function %s security definer', f.signature);
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
  end loop;
end $$;

-- The four browser RPCs do not need owner's rights: let their table ACLs and
-- RLS apply. The rate counter remains service-only, with an empty path.
alter function public.adjust_gesamtstunden(numeric) security invoker;
alter function public.create_nutzungslog_atomic(date,text,numeric,numeric,jsonb,text,jsonb,numeric,uuid) security invoker;
alter function public.delete_nutzungslog_atomic(uuid) security invoker;
alter function public.delete_changelog_cascade(uuid) security invoker;
alter function public.bump_extract_rate(text,timestamptz) set search_path = '';
grant execute on function public.bump_extract_rate(text,timestamptz) to service_role;

grant usage on schema public to anon;
grant select on public.beitraege, public.ausgaben, public.kontostand_snapshots,
  public.reservierungen, public.gastsessions, public.nutzungslogs, public.boot_stats,
  public.eigentuemer, public.abrechnung_config, public.wartung, public.gentleman_rules,
  public.ferien, public.changelog, public.phone_upload_sessions to anon;
grant delete on public.beitraege, public.ausgaben, public.kontostand_snapshots,
  public.reservierungen, public.gastsessions, public.nutzungslogs, public.wartung,
  public.gentleman_rules, public.ferien, public.changelog to anon;

grant insert (fahrer,betrag,monat,notiz) on public.beitraege to anon;
grant insert (bezeichnung,betrag,kategorie,datum,notiz,bezahlt_von,dokument_pfad,verarbeitungs_status,treibstoff_liter) on public.ausgaben to anon;
grant update (bezeichnung,betrag,kategorie,datum,notiz,bezahlt_von,erstattet,erstattet_am,dokument_pfad,verarbeitungs_status,treibstoff_liter) on public.ausgaben to anon;
grant insert (betrag,datum,notiz) on public.kontostand_snapshots to anon;
grant insert (fahrer,datum,ganzer_tag,von_zeit,bis_zeit,notiz) on public.reservierungen to anon;
grant update (fahrer,datum,ganzer_tag,von_zeit,bis_zeit,notiz) on public.reservierungen to anon;
grant insert (gast_name,betrag,bezahlt_an,datum,notiz,auf_konto_eingezahlt) on public.gastsessions to anon;
grant update (gast_name,betrag,bezahlt_an,datum,notiz,auf_konto_eingezahlt,eingezahlt_am,eingezahlt_von) on public.gastsessions to anon;
grant insert (datum,fahrer,betriebsstunden,treibstoff_liter,aktivitaeten,notiz,teilnehmer,reservierung_id) on public.nutzungslogs to anon;
grant update (datum,fahrer,betriebsstunden,treibstoff_liter,aktivitaeten,notiz,teilnehmer,motorstunden_stand,reservierung_id) on public.nutzungslogs to anon;
grant update (gesamtstunden,startsaldo,kaufdatum,modell,motorstunden_grenze,notiz,aktualisiert_am) on public.boot_stats to anon;
grant update (fahrer,anteil_prozent,einstieg_datum,notiz) on public.eigentuemer to anon;
grant update (boot_marktwert,bewertung_datum,abschreibung_prozent,kuendigungsfrist_monate,beitrag_pro_monat,notiz,aktualisiert_am) on public.abrechnung_config to anon;
grant insert (bezeichnung,intervall_monate,naechstes_datum,zustaendig,notiz) on public.wartung to anon;
grant update (erledigt,erledigt_am) on public.wartung to anon;
grant insert (regel,sortierung) on public.gentleman_rules to anon;
grant update (regel,sortierung,aktiv) on public.gentleman_rules to anon;
grant insert (fahrer,von_datum,bis_datum,notiz) on public.ferien to anon;
grant update (fahrer,von_datum,bis_datum,notiz) on public.ferien to anon;
grant insert (datum,titel,beschreibung,kategorie) on public.changelog to anon;
grant update (datum,titel,beschreibung,kategorie) on public.changelog to anon;
grant insert (token,status,expires_at) on public.phone_upload_sessions to anon;
grant update (status,storage_path,uploaded_at) on public.phone_upload_sessions to anon;

grant execute on function public.adjust_gesamtstunden(numeric),
  public.create_nutzungslog_atomic(date,text,numeric,numeric,jsonb,text,jsonb,numeric,uuid),
  public.delete_nutzungslog_atomic(uuid), public.delete_changelog_cascade(uuid) to anon;

-- Existing edge functions use service_role. Preserve their table rights and the
-- Storage service's rights; no authenticated browser exists in the current app.
grant select on public.reservierungen to service_role;
grant insert on public.changelog to service_role;
grant select, update on public.ausgaben to service_role;

alter role anon set statement_timeout = '5s';
alter role authenticated set statement_timeout = '10s';

-- Only this private receipt bucket is used. Types/10 MiB match extractInvoice.ts.
update storage.buckets set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp']
where id = 'dokumente';

-- Phone upload uses the existing two-second polling path. Tokens should never
-- be broadcast by a shared public Realtime channel (including DELETE events).
do $$
begin
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'phone_upload_sessions') then
    alter publication supabase_realtime drop table public.phone_upload_sessions;
  end if;
end $$;

-- Assert the release's actual catalog state, rather than trusting REVOKE notices.
do $$
begin
  if exists (
    select 1 from pg_class c where c.relnamespace in
      (select oid from pg_namespace where nspname in ('public','graphql_public'))
      and c.relkind in ('r','p') and (not c.relrowsecurity
        or has_table_privilege('anon', c.oid, 'TRUNCATE,REFERENCES,TRIGGER')
        or has_table_privilege('authenticated', c.oid, 'TRUNCATE,REFERENCES,TRIGGER'))
  ) then raise exception '033: exposed table hardening incomplete'; end if;
  if exists (
    select 1 from pg_proc p where p.pronamespace in
      (select oid from pg_namespace where nspname in ('public','graphql_public'))
      and (not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
        or (p.prosecdef and (has_function_privilege('anon',p.oid,'EXECUTE')
          or has_function_privilege('authenticated',p.oid,'EXECUTE'))))
  ) then raise exception '033: exposed function hardening incomplete'; end if;
  if exists (
    select 1 from pg_default_acl d, lateral aclexplode(d.defaclacl) a
    where a.grantee in ('anon'::regrole,'authenticated'::regrole)
      and (d.defaclnamespace = 0 or d.defaclnamespace in
        (select oid from pg_namespace where nspname in ('public','graphql_public')))
  ) then raise exception '033: browser default ACLs remain'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
