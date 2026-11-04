-- Same disposable PostgreSQL session as database-security-checks.sql.
create temp table member_inventory (name text primary key, insert_column text, update_column text);
insert into member_inventory values
 ('beitraege','fahrer',null), ('ausgaben','bezeichnung','bezeichnung'),
 ('kontostand_snapshots','betrag',null), ('reservierungen','fahrer','fahrer'),
 ('gastsessions','gast_name','gast_name'), ('nutzungslogs','fahrer','fahrer'),
 ('boot_stats',null,'modell'), ('eigentuemer',null,'fahrer'),
 ('abrechnung_config',null,'notiz'), ('wartung','bezeichnung','erledigt'),
 ('gentleman_rules','regel','regel'), ('ferien','fahrer','fahrer'),
 ('changelog','titel','titel'), ('phone_upload_sessions','token',null);
grant select on member_inventory to anon, authenticated;

set role service_role;
insert into storage.buckets(id,public) values ('other-private',false);
insert into storage.objects(bucket_id,name) values ('dokumente','existing-private.jpg'),('other-private','other.jpg');
reset role;

select pg_temp.check_security(not has_any_column_privilege('anon',('public.'||name)::regclass,'SELECT,INSERT,UPDATE'), 'anon column rights absent: '||name)
from member_inventory;
select pg_temp.check_security(has_table_privilege('authenticated',('public.'||name)::regclass,'SELECT'), 'member SELECT granted: '||name)
from member_inventory;

set role anon;
do $$ declare t record; begin
  for t in select * from member_inventory loop
    perform pg_temp.check_security(pg_temp.expect_denied(format('select * from public.%I',t.name)), 'anon cannot read '||t.name);
    perform pg_temp.check_security(pg_temp.expect_denied(format('insert into public.%I default values',t.name)), 'anon cannot insert '||t.name);
    perform pg_temp.check_security(pg_temp.expect_denied(format('update public.%I set %I = %I',t.name,coalesce(t.update_column,'id'),coalesce(t.update_column,'id'))), 'anon cannot update '||t.name);
    perform pg_temp.check_security(pg_temp.expect_denied(format('delete from public.%I',t.name)), 'anon cannot delete '||t.name);
  end loop;
end $$;
select pg_temp.check_security(pg_temp.expect_denied('select public.adjust_gesamtstunden(1)'), 'anon cannot adjust hours');
select pg_temp.check_security(pg_temp.expect_denied('select public.create_nutzungslog_atomic(''2040-01-01'',''roger'',1,null,''[]'',null,''[]'',null,null)'), 'anon cannot create atomic trip');
select pg_temp.check_security(pg_temp.expect_denied('select public.delete_nutzungslog_atomic(gen_random_uuid())'), 'anon cannot delete atomic trip');
select pg_temp.check_security(pg_temp.expect_denied('select public.delete_changelog_cascade(gen_random_uuid())'), 'anon cannot cascade news');
select pg_temp.check_security(pg_temp.expect_denied('select boatbuddy_private.is_member()'), 'anon cannot invoke private membership helper');
select pg_temp.check_security(pg_temp.expect_denied($sql$insert into storage.objects(bucket_id,name) values ('dokumente','attack.jpg')$sql$), 'anon cannot upload receipts directly');
select pg_temp.check_security(not exists(select 1 from storage.objects), 'anon cannot list receipts');
reset role;

-- Future personal member sees the same shared boat; a normal authenticated
-- account (even with forged user_metadata AND a stale member JWT claim) cannot.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','00000000-0000-4000-8000-000000000002','exp',extract(epoch from now())+900)::text,false);
set role authenticated;
select pg_temp.check_security(boatbuddy_private.is_member(), 'second personal member accepted');
select pg_temp.check_security(exists(select 1 from storage.objects where name='existing-private.jpg'), 'member reads existing boat receipts');
select pg_temp.check_security(not exists(select 1 from storage.objects where bucket_id='other-private'), 'member cannot read unrelated bucket');
select pg_temp.check_security(pg_temp.expect_denied($sql$insert into storage.objects(bucket_id,name) values ('other-private','attack.jpg')$sql$), 'member cannot upload into unrelated bucket');
do $$ declare t record; n integer; begin
  for t in select * from member_inventory loop
    execute format('select count(*) from public.%I',t.name) into n;
    perform pg_temp.check_security(n >= 0,'personal member can select '||t.name);
  end loop;
end $$;
insert into storage.objects(bucket_id,name) values ('dokumente','member-fixture.jpg');
select pg_temp.check_security(exists(select 1 from storage.objects where name='member-fixture.jpg'), 'member can read uploaded receipt');
delete from storage.objects where name='member-fixture.jpg';
select pg_temp.check_security(not exists(select 1 from storage.objects where name='member-fixture.jpg'), 'member can remove abandoned receipt');
reset role;

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','00000000-0000-4000-8000-000000000003',
  'exp',extract(epoch from now())+900,'app_metadata','{"boatbuddy_member":true}'::jsonb)::text,false);
set role authenticated;
select pg_temp.check_security(not boatbuddy_private.is_member(), 'user-editable metadata and JWT membership claim confer no membership');
select pg_temp.check_security(not exists(select 1 from storage.objects), 'nonmember cannot read existing receipts');
do $$ declare t record; n integer; begin
  for t in select * from member_inventory loop
    execute format('select count(*) from public.%I',t.name) into n;
    perform pg_temp.check_security(n = 0,'nonmember reads no rows: '||t.name);
    if t.insert_column is not null then
      perform pg_temp.check_security(pg_temp.expect_denied(format('insert into public.%I (%I) values (null)',t.name,t.insert_column)), 'nonmember cannot insert '||t.name);
    end if;
    if t.update_column is not null then
      execute format('update public.%I set %I = %I',t.name,t.update_column,t.update_column);
      get diagnostics n = row_count;
      perform pg_temp.check_security(n = 0,'nonmember cannot update '||t.name);
    end if;
    if has_table_privilege(current_user,('public.'||t.name)::regclass,'DELETE') then
      execute format('delete from public.%I',t.name);
      get diagnostics n = row_count;
      perform pg_temp.check_security(n = 0,'nonmember cannot delete '||t.name);
    end if;
  end loop;
end $$;
select pg_temp.check_security(pg_temp.expect_denied($sql$insert into storage.objects(bucket_id,name) values ('dokumente','forged.jpg')$sql$), 'nonmember cannot upload');
select pg_temp.check_security(pg_temp.expect_denied('select public.create_nutzungslog_atomic(''2040-01-01'',''roger'',1,null,''[]'',null,''[]'',null,null)'), 'invoker RPC requires membership');
reset role;

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','00000000-0000-4000-8000-000000000002','exp',extract(epoch from now())-1)::text,false);
set role authenticated;
select pg_temp.check_security(not boatbuddy_private.is_member(), 'expired member pass denied');
select pg_temp.check_security(not exists(select 1 from public.boot_stats), 'expired member reads no boat data');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','00000000-0000-4000-8000-000000000002','exp',extract(epoch from now())+900)::text,false);
update auth.users set raw_app_meta_data='{}' where id='00000000-0000-4000-8000-000000000002';
set role authenticated;
select pg_temp.check_security(not boatbuddy_private.is_member(), 'membership revocation takes effect without waiting for JWT refresh');
reset role;
select count(*) || ' PostgreSQL security/compatibility assertions passed' from security_results;
