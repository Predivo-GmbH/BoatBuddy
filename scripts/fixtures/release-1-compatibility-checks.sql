-- Runs only in test-database-security.mjs's disposable, network-disabled DB, after the
-- RELEASE-1 migrations (034 additive) and BEFORE the gated release-2 migration (035).
-- Proves the state the live site is in between the two releases: the OLD anonymous
-- front end still works, members work, a signed-in non-member gets nothing.
-- Everything runs in one transaction that is ROLLED BACK, so no fixture row reaches
-- the release-2 checks.
begin;
create temp table r1_results (name text);
create function pg_temp.r1_check(ok boolean, label text) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if ok is distinct from true then raise exception 'FAILED (release 1): %', label; end if;
  insert into r1_results values (label);
end $$;
create function pg_temp.r1_denied(statement text) returns boolean
language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
begin
  execute statement;
  return false;
exception when insufficient_privilege then return true;
end $$;
grant execute on function pg_temp.r1_check(boolean,text), pg_temp.r1_denied(text) to anon, authenticated, service_role;
create temp table r1_inventory (name text primary key);
insert into r1_inventory values ('beitraege'),('ausgaben'),('kontostand_snapshots'),('reservierungen'),
  ('gastsessions'),('nutzungslogs'),('boot_stats'),('eigentuemer'),('abrechnung_config'),('wartung'),
  ('gentleman_rules'),('ferien'),('changelog'),('phone_upload_sessions');
grant select on r1_inventory to anon, authenticated;

insert into auth.users(id,raw_app_meta_data,raw_user_meta_data) values
  ('07a91df9-55d7-42b4-9944-82f5b88dcf7e','{"boatbuddy_member":true}','{}'),
  ('00000000-0000-4000-8000-000000000003','{}','{"boatbuddy_member":true}');
set role service_role;
insert into storage.objects(bucket_id,name) values ('dokumente','existing-before-cutover.jpg');
reset role;

-- Release 1 is additive: the old anon rights and policies are all still there.
select pg_temp.r1_check(has_table_privilege('anon',('public.'||name)::regclass,'SELECT'), 'anon keeps SELECT: '||name) from r1_inventory;
select pg_temp.r1_check(exists(select 1 from pg_policies where schemaname='public' and tablename='beitraege' and policyname='anon_all'), 'old anon policy kept');
select pg_temp.r1_check(exists(select 1 from pg_policies where schemaname='storage' and policyname='Anon can upload invoices'), 'old anon Storage policy kept');
select pg_temp.r1_check(has_function_privilege('anon','public.create_nutzungslog_atomic(date,text,numeric,numeric,jsonb,text,jsonb,numeric,uuid)','EXECUTE'), 'anon keeps the trip RPC');
-- ...but none of them is shared with signed-in users any more.
select pg_temp.r1_check(not exists(select 1 from pg_policies where schemaname in ('public','storage')
  and roles && array['anon','public']::name[] and roles <> array['anon']::name[]), 'no anon policy also serves authenticated or PUBLIC');
select pg_temp.r1_check(not exists(select 1 from pg_policies where schemaname='public' and tablename='phone_upload_sessions' and policyname='members'), 'QR table has only the narrow member policies');

-- The OLD front end, unchanged: anon reads, writes, calls RPCs and uses Storage.
set role anon;
do $$ declare t record; n integer; begin
  for t in select * from r1_inventory loop
    execute format('select count(*) from public.%I',t.name) into n;
    perform pg_temp.r1_check(n >= 0,'old front end reads '||t.name);
  end loop;
end $$;
insert into public.beitraege(fahrer,betrag,monat,notiz) values ('roger',400,'2040-01-01','release-1 anon fixture');
select pg_temp.r1_check(exists(select 1 from public.beitraege where notiz='release-1 anon fixture'), 'old front end writes a contribution');
insert into public.ausgaben(bezeichnung,betrag,kategorie,datum,bezahlt_von) values ('r1-anon',20,'service','2040-01-01','roger');
update public.ausgaben set erstattet = true, erstattet_am = '2040-01-02' where bezeichnung = 'r1-anon';
select pg_temp.r1_check(exists(select 1 from public.ausgaben where bezeichnung='r1-anon' and erstattet), 'old front end edits an expense');
select public.create_nutzungslog_atomic('2040-01-01','roger',1,null,'[]',null,'[]',null,null);
select pg_temp.r1_check(exists(select 1 from public.nutzungslogs where datum='2040-01-01'), 'old front end logs a trip through the RPC');
delete from public.beitraege where notiz='release-1 anon fixture';
select pg_temp.r1_check(not exists(select 1 from public.beitraege where notiz='release-1 anon fixture'), 'old front end deletes');
-- Old desktop QR flow: anon mints a token with its own expiry, the old phone page completes it.
insert into public.phone_upload_sessions(token,status,expires_at) values ('r1-old-flow-token','pending',now()+interval '10 minutes');
update public.phone_upload_sessions set status='uploaded', storage_path='phone-uploads/r1-old-flow-token/photo.jpg', uploaded_at=now() where token='r1-old-flow-token';
select pg_temp.r1_check(exists(select 1 from public.phone_upload_sessions where token='r1-old-flow-token' and status='uploaded'), 'old QR flow still completes');
insert into storage.objects(bucket_id,name) values ('dokumente','r1-old-receipt.jpg');
select pg_temp.r1_check(exists(select 1 from storage.objects where name='existing-before-cutover.jpg'), 'old front end reads receipts');
insert into storage.objects(bucket_id,name) values ('dokumente','phone-uploads/r1-old-flow-token/photo.jpg');
select pg_temp.r1_check(exists(select 1 from storage.objects where name='phone-uploads/r1-old-flow-token/photo.jpg'), 'old phone page uploads');
select pg_temp.r1_check(pg_temp.r1_denied('select boatbuddy_private.is_member()'), 'anon cannot invoke the private membership helper');
reset role;

-- The NEW front end: the shared member identity works on every table, QR and Storage.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','07a91df9-55d7-42b4-9944-82f5b88dcf7e','exp',extract(epoch from now())+900)::text,false);
set role authenticated;
select pg_temp.r1_check(boatbuddy_private.is_member(), 'member accepted in release 1');
select pg_temp.r1_check(exists(select 1 from public.ausgaben where bezeichnung='r1-anon'), 'member sees what the old front end wrote');
insert into public.beitraege(fahrer,betrag,monat,notiz) values ('dani',400,'2040-02-01','release-1 member fixture');
select pg_temp.r1_check(exists(select 1 from public.beitraege where notiz='release-1 member fixture'), 'member writes a contribution');
select public.adjust_gesamtstunden(0);
select pg_temp.r1_check(true, 'member calls the business RPCs');
insert into public.phone_upload_sessions(token,status) values ('0123456789abcdef0123456789abcdef','pending');
select pg_temp.r1_check(exists(select 1 from public.phone_upload_sessions where token='0123456789abcdef0123456789abcdef'
  and expires_at > now() + interval '9 minutes' and expires_at <= now() + interval '10 minutes'), 'member QR expiry comes from the server clock');
select pg_temp.r1_check(pg_temp.r1_denied($sql$insert into public.phone_upload_sessions(token,status,expires_at) values ('fedcba9876543210fedcba9876543210','pending',now()+interval '1 day')$sql$), 'member cannot pick a long QR lifetime');
insert into storage.objects(bucket_id,name) values ('dokumente','r1-member-receipt.jpg');
select pg_temp.r1_check(exists(select 1 from storage.objects where name='existing-before-cutover.jpg'), 'member reads receipts');
reset role;

-- A signed-in NON-member gets nothing, not even through the old anon policies.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','00000000-0000-4000-8000-000000000003',
  'exp',extract(epoch from now())+900,'app_metadata','{"boatbuddy_member":true}'::jsonb)::text,false);
set role authenticated;
select pg_temp.r1_check(not boatbuddy_private.is_member(), 'non-member refused in release 1');
do $$ declare t record; n integer; begin
  for t in select * from r1_inventory loop
    execute format('select count(*) from public.%I',t.name) into n;
    perform pg_temp.r1_check(n = 0,'non-member reads no rows in release 1: '||t.name);
  end loop;
end $$;
select pg_temp.r1_check(not exists(select 1 from storage.objects), 'non-member reads no receipts in release 1');
select pg_temp.r1_check(pg_temp.r1_denied($sql$insert into public.changelog(titel,kategorie) values ('forged','neu')$sql$), 'non-member cannot write news in release 1');
reset role;

select count(*) || ' release-1 compatibility assertions passed' from r1_results;
rollback;

-- Persisted on purpose: an old anonymous QR token still pending when release 2 lands.
-- member-security-checks.sql proves 035 expires it.
insert into public.phone_upload_sessions(token,status,expires_at) values ('pre-cutover-anon-token','pending',now()+interval '5 minutes');
