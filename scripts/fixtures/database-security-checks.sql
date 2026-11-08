-- Runs only in test-database-security.mjs's disposable, network-disabled DB.
create temp table security_results (name text);
create function pg_temp.check_security(ok boolean, label text) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', label; end if;
  insert into security_results values (label);
end $$;
create function pg_temp.expect_denied(statement text) returns boolean
language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
begin
  execute statement;
  return false;
exception when insufficient_privilege then return true;
end $$;
create function pg_temp.expect_check(statement text) returns boolean
language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
begin
  execute statement;
  return false;
exception when check_violation then return true;
end $$;
create function pg_temp.expect_unique(statement text) returns boolean
language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
begin
  execute statement;
  return false;
exception when unique_violation then return true;
end $$;
grant execute on function pg_temp.check_security(boolean,text), pg_temp.expect_denied(text) to anon, authenticated, service_role;
grant execute on function pg_temp.expect_check(text), pg_temp.expect_unique(text) to service_role;

select pg_temp.check_security(not exists (
  select 1 from pg_class where relnamespace = 'public'::regnamespace
  and relkind in ('r','p') and not relrowsecurity
), 'RLS on every exposed table');
select pg_temp.check_security(not exists (
  select 1 from pg_proc p where pronamespace in
    (select oid from pg_namespace where nspname in ('public','graphql_public'))
    and pg_has_role(current_user, p.proowner, 'USAGE')
    and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
), 'all exposed function paths fixed');
select pg_temp.check_security(not exists (
  select 1 from pg_proc p where pronamespace in
    (select oid from pg_namespace where nspname in ('public','graphql_public'))
    and prosecdef and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
), 'no browser-callable SECURITY DEFINER function in any exposed schema, whoever owns it');
select pg_temp.check_security(not exists (
  select 1 from pg_extension where extname = 'pg_graphql' or extnamespace = 'public'::regnamespace
), 'no GraphQL or extensions in public');
-- Hosted Supabase keeps supabase_admin's defaults out of the migrator's reach. This
-- database must too, or the checks below prove nothing about staging/production.
select pg_temp.check_security(exists (
  select 1 from pg_default_acl d, lateral aclexplode(d.defaclacl) a
  where a.grantee in ('anon'::regrole, 'authenticated'::regrole)
    and not pg_has_role(current_user, d.defaclrole, 'SET')
), 'platform-owned browser default ACLs present, as on hosted Supabase');
-- SB-07's reach: global defaults and the browser-exposed schemas. Supabase's own
-- postgres defaults in `storage` stay, as on hosted (PostgREST serves only public).
select pg_temp.check_security(not exists (
  select 1 from pg_default_acl d, lateral aclexplode(d.defaclacl) a
  where a.grantee in ('anon'::regrole, 'authenticated'::regrole)
    and pg_has_role(current_user, d.defaclrole, 'SET')
    and (d.defaclnamespace = 0 or d.defaclnamespace in
      (select oid from pg_namespace where nspname in ('public','graphql_public')))
), 'no global or exposed-schema browser default ACLs the migrator can change');
select pg_temp.check_security(not exists (
  select 1 from pg_proc p where pronamespace = 'public'::regnamespace and prosecdef
  and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
), 'no browser-callable SECURITY DEFINER functions');
select pg_temp.check_security(not public and file_size_limit = 10485760 and
  allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'], 'private bounded receipt bucket')
from storage.buckets where id = 'dokumente';
select pg_temp.check_security(exists (select 1 from pg_roles where rolname = 'anon' and 'statement_timeout=5s' = any(rolconfig)), 'anon timeout');
select pg_temp.check_security(exists (select 1 from pg_roles where rolname = 'authenticated' and 'statement_timeout=10s' = any(rolconfig)), 'authenticated timeout');

-- Future objects must actually be inaccessible, not just look right in a catalog query.
create table public.future_security_probe (id int);
create sequence public.future_security_sequence;
create function public.future_security_function() returns integer language sql as $$ select 1 $$;
create type public.future_security_type as enum ('fixture');
create schema future_security_schema;
select pg_temp.check_security(not has_table_privilege(r, 'public.future_security_probe', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), r || ' future table denied')
from unnest(array['anon','authenticated']) r;
select pg_temp.check_security(not has_sequence_privilege(r, 'public.future_security_sequence', 'USAGE,SELECT,UPDATE'), r || ' future sequence denied')
from unnest(array['anon','authenticated']) r;
select pg_temp.check_security(not has_function_privilege(r, 'public.future_security_function()', 'EXECUTE'), r || ' future function denied')
from unnest(array['anon','authenticated']) r;
select pg_temp.check_security(not has_type_privilege(r, 'public.future_security_type', 'USAGE'), r || ' future type denied')
from unnest(array['anon','authenticated']) r;
select pg_temp.check_security(not has_schema_privilege(r, 'future_security_schema', 'USAGE,CREATE'), r || ' future schema denied')
from unnest(array['anon','authenticated']) r;
drop table public.future_security_probe;
drop sequence public.future_security_sequence;
drop function public.future_security_function();
drop type public.future_security_type;
drop schema future_security_schema;

select pg_temp.check_security(not has_table_privilege(r, c.oid, 'TRUNCATE,TRIGGER,REFERENCES'), r || ' dangerous rights denied: ' || c.relname)
from pg_class c cross join unnest(array['anon','authenticated']) r
where c.relnamespace in (select oid from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema')
  and c.relkind in ('r','p');
select pg_temp.check_security(not has_schema_privilege(r,n.oid,'CREATE'), r || ' cannot create in ' || n.nspname)
from pg_namespace n cross join unnest(array['anon','authenticated']) r
where n.nspname not like 'pg_%' and n.nspname <> 'information_schema';

set role anon;
select pg_temp.check_security(pg_temp.expect_denied('truncate public.ausgaben'), 'TRUNCATE refused at execution');
select pg_temp.check_security(pg_temp.expect_denied('create table public.attack(id int)'), 'schema CREATE refused');
select pg_temp.check_security(pg_temp.expect_denied('select public.bump_extract_rate(''attack'',now())'), 'rate RPC refused');
select pg_temp.check_security(pg_temp.expect_denied('select * from public.extract_rate_limit'), 'rate table refused');
select pg_temp.check_security(pg_temp.expect_denied('select * from public.client_error_reports'), 'error reports unreadable by anon');
select pg_temp.check_security(pg_temp.expect_denied($sql$insert into public.client_error_reports(reference,area,screen,action,message) values ('E-ANON23','other','x','x','forged')$sql$), 'error reports only through the function (anon)');
select pg_temp.check_security(pg_temp.expect_denied('select * from public.tanken'), 'unused archive table refused');
select pg_temp.check_security(pg_temp.expect_denied('update public.ausgaben set erstellt_am = now()'), 'expense timestamps protected');
select pg_temp.check_security(pg_temp.expect_denied('update public.ausgaben set extraktion_daten = ''{}'''), 'AI result protected');
select pg_temp.check_security(pg_temp.expect_denied('update public.changelog set quelle_id = gen_random_uuid()'), 'source links protected');
select pg_temp.check_security(pg_temp.expect_denied('update public.phone_upload_sessions set token = ''replaced'''), 'upload token immutable');
select pg_temp.check_security(pg_temp.expect_denied('update public.phone_upload_sessions set expires_at = now()'), 'upload expiry immutable');
select pg_temp.check_security(pg_temp.expect_denied('insert into public.boot_stats(modell) values (''another boat'')'), 'singleton INSERT denied');

reset role;
insert into auth.users(id,raw_app_meta_data,raw_user_meta_data) values
  ('07a91df9-55d7-42b4-9944-82f5b88dcf7e','{"boatbuddy_member":true}','{}'),
  ('00000000-0000-4000-8000-000000000002','{"boatbuddy_member":true}','{}'),
  ('00000000-0000-4000-8000-000000000003','{}','{"boatbuddy_member":true}');
select set_config('request.jwt.claims', jsonb_build_object('sub','07a91df9-55d7-42b4-9944-82f5b88dcf7e',
  'role','authenticated','exp',extract(epoch from now())+900)::text,false);
set role authenticated;
select pg_temp.check_security(boatbuddy_private.is_member(), 'native member accepted');
select pg_temp.check_security(pg_temp.expect_denied('update public.ausgaben set extraktion_daten = ''{}'''), 'member cannot forge AI fields');
select pg_temp.check_security(pg_temp.expect_denied('update public.changelog set quelle_id = gen_random_uuid()'), 'member cannot forge derived links');
select pg_temp.check_security(pg_temp.expect_denied('update public.phone_upload_sessions set token = ''replaced'''), 'member cannot replace QR token');
select pg_temp.check_security(pg_temp.expect_denied('update public.phone_upload_sessions set expires_at = now()'), 'member cannot extend QR lifetime');
select pg_temp.check_security(pg_temp.expect_denied('update public.phone_upload_sessions set status = ''uploaded'''), 'phone completion is service-only');
select pg_temp.check_security(pg_temp.expect_denied('select * from public.client_error_reports'), 'error reports unreadable by a member');
select pg_temp.check_security(pg_temp.expect_denied($sql$insert into public.client_error_reports(reference,area,screen,action,message) values ('E-MEMB23','other','x','x','forged')$sql$), 'error reports only through the function (member)');

-- Real app paths: inserts fire helpers/triggers, deletes cascade both ways.
insert into public.beitraege(fahrer,betrag,monat,notiz) values ('roger',400,'2040-01-01','security fixture');
select pg_temp.check_security(exists(select 1 from public.changelog where quelle_typ = 'beitrag'), 'contribution trigger writes derived fields');
insert into public.ausgaben(bezeichnung,betrag,kategorie,datum,bezahlt_von,notiz)
values ('fixture',20,'service','2040-01-01','roger','security fixture');
update public.ausgaben set erstattet = true, erstattet_am = '2040-01-02' where bezeichnung = 'fixture';
select pg_temp.check_security(exists(select 1 from public.changelog where quelle_typ = 'erstattung'), 'reimbursement trigger works');
select public.delete_changelog_cascade(id) from public.changelog where quelle_typ = 'erstattung';
select pg_temp.check_security(exists(select 1 from public.ausgaben where bezeichnung = 'fixture' and not erstattet), 'news delete undoes reimbursement');
insert into public.reservierungen(fahrer,datum,ganzer_tag) values ('roger','2040-02-01',true);
insert into public.ferien(fahrer,von_datum,bis_datum) values ('dani','2040-03-01','2040-03-03');
-- Migration 027's vacation trigger emits a title but no source link.
select pg_temp.check_security(exists(select 1 from public.changelog
  where titel = 'Dani Urlaub: 01.' || chr(8211) || '03. M' || chr(228) || 'rz'), 'German date helper works inside trigger');
insert into public.gastsessions(gast_name,bezahlt_an,datum) values ('fixture','roger','2040-01-01');
update public.gastsessions set auf_konto_eingezahlt = true, eingezahlt_am = '2040-01-02', eingezahlt_von = 'roger' where gast_name = 'fixture';
select pg_temp.check_security(exists(select 1 from public.gastsessions where gast_name = 'fixture' and auf_konto_eingezahlt), 'guest deposit works');
insert into public.kontostand_snapshots(betrag,datum) values (500,'2040-01-01');
select public.delete_changelog_cascade(id) from public.changelog where quelle_typ = 'kontostand';
select pg_temp.check_security(not exists(select 1 from public.kontostand_snapshots), 'news can cascade-delete a snapshot');
update public.boot_stats set gesamtstunden = 100, aktualisiert_am = now();
select public.create_nutzungslog_atomic('2040-01-01','roger',2.5,null,'[]',null,'[]',null,null);
select pg_temp.check_security((select gesamtstunden = 102.5 from public.boot_stats), 'atomic trip adds hours');
select public.delete_nutzungslog_atomic(id) from public.nutzungslogs;
select pg_temp.check_security((select gesamtstunden = 100 from public.boot_stats), 'atomic trip delete subtracts hours once');
select public.adjust_gesamtstunden(0);
select pg_temp.check_security((select gesamtstunden = 100 from public.boot_stats), 'hour adjustment works');
insert into public.wartung(bezeichnung) values ('fixture');
update public.wartung set erledigt = true, erledigt_am = '2040-01-01' where bezeichnung = 'fixture';
select pg_temp.check_security(exists(select 1 from public.wartung where erledigt), 'maintenance toggle works');
insert into public.gentleman_rules(regel,sortierung) values ('fixture',100);
update public.gentleman_rules set aktiv = false where regel = 'fixture';
select pg_temp.check_security(exists(select 1 from public.gentleman_rules where regel = 'fixture' and not aktiv), 'rules edit works');
insert into public.changelog(datum,titel,beschreibung,kategorie) values ('2040-01-01','fixture','manual','neu');
update public.changelog set titel = 'edited' where titel = 'fixture';
select pg_temp.check_security(exists(select 1 from public.changelog where titel = 'edited'), 'manual news edit works');
insert into public.phone_upload_sessions(token,status) values ('00000000000000000000000000000001','pending');
select pg_temp.check_security(exists(select 1 from public.phone_upload_sessions where expires_at > now() + interval '9 minutes' and expires_at <= now() + interval '10 minutes'), 'QR expiry comes from server clock');
select pg_temp.check_security(pg_temp.expect_denied($sql$insert into public.phone_upload_sessions(token,status,expires_at) values ('00000000000000000000000000000002','pending',now()+interval '11 minutes')$sql$), 'QR lifetime bounded by database');
select pg_temp.check_security(pg_temp.expect_denied($sql$insert into public.phone_upload_sessions(token,status) values ('guessable','pending')$sql$), 'QR shape constrained');
reset role;
set role service_role;
update public.phone_upload_sessions set status = 'uploaded', storage_path = 'phone-uploads/00000000000000000000000000000001/photo.jpg', uploaded_at = now() where token = '00000000000000000000000000000001';
select pg_temp.check_security(exists(select 1 from public.phone_upload_sessions where status = 'uploaded'), 'phone upload and polling work');
reset role;
set role authenticated;
delete from public.beitraege;
select pg_temp.check_security(not exists(select 1 from public.changelog where quelle_typ = 'beitrag'), 'source delete removes derived news');
reset role;

set role service_role;
select pg_temp.check_security(public.bump_extract_rate('fixture','2040-01-01') = 1, 'edge rate counter works');
select pg_temp.check_security((select count from public.extract_rate_limit where bucket_key = 'fixture' and window_start = '2040-01-01') = 1, 'member-session reads its counter without spending it');
insert into public.client_error_reports(reference,area,screen,action,status,message,app_version,user_id)
values ('E-FIX234','signin','anmeldung','memberSession',503,'fixture report','abc1234','07a91df9-55d7-42b4-9944-82f5b88dcf7e');
select pg_temp.check_security(exists(select 1 from public.client_error_reports where reference = 'E-FIX234' and area = 'signin'), 'report-client-error stores and reads back its row');
select pg_temp.check_security(pg_temp.expect_check($sql$insert into public.client_error_reports(reference,area,screen,action,message) values ('not-a-ref','other','x','x','m')$sql$), 'report reference shape enforced');
select pg_temp.check_security(pg_temp.expect_check($sql$insert into public.client_error_reports(reference,area,screen,action,message) values ('E-FIX235','payment','x','x','m')$sql$), 'report area limited to money, signin, other');
select pg_temp.check_security(pg_temp.expect_check($sql$insert into public.client_error_reports(reference,area,screen,action,message) values ('E-FIX236','other','two words','x','m')$sql$), 'report screen shape enforced');
select pg_temp.check_security(pg_temp.expect_check(format($sql$insert into public.client_error_reports(reference,area,screen,action,message) values ('E-FIX237','other','x','x',%L)$sql$, repeat('m', 501))), 'report message bounded to 500 characters');
select pg_temp.check_security(pg_temp.expect_unique($sql$insert into public.client_error_reports(reference,area,screen,action,message) values ('E-FIX234','other','x','x','m')$sql$), 'report reference unique');
update public.ausgaben set extraktion_daten = '{"fixture":true}' where bezeichnung = 'fixture';
select pg_temp.check_security(exists(select 1 from public.ausgaben where extraktion_daten is not null), 'service AI result update works');
insert into public.changelog(titel,kategorie) values ('server fixture','daten');
select pg_temp.check_security(exists(select 1 from public.changelog where titel = 'server fixture'), 'backfill service can write news');
reset role;
-- member-security-checks.sql continues this session and emits the final receipt.
