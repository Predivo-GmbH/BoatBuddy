-- LOCAL TEST ONLY: platform schemas/ACLs needed by BoatBuddy's historic SQL.
-- The isolated Postgres container has Supabase's roles but no Storage API server.
create schema if not exists storage;
create schema if not exists extensions;
create table storage.buckets (
  id text primary key, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets,
  name text not null, owner_id text, metadata jsonb
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable
  as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1] $$;
insert into storage.buckets (id, public) values ('dokumente', true);
grant usage on schema public, storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
alter default privileges for role postgres grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres grant execute on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
create extension btree_gist with schema public;
create extension pg_graphql;
