-- LOCAL TEST ONLY: platform schemas/ACLs needed by BoatBuddy's historic SQL.
-- The isolated Postgres container has Supabase's roles but no Storage API server.
-- Runs as supabase_admin, the platform, so ownership matches hosted Supabase:
-- Storage tables belong to supabase_storage_admin, extensions to supabase_admin.
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
alter table storage.buckets owner to supabase_storage_admin;
alter table storage.objects owner to supabase_storage_admin;
grant usage on schema public, storage to postgres, anon, authenticated, service_role;
-- The grants hosted staging shows on these two tables (read 2026-11-04).
grant select, insert, update, delete on all tables in schema storage to anon, authenticated;
grant all on all tables in schema storage to postgres, service_role;
alter default privileges for role postgres grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres grant execute on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
create extension btree_gist with schema public;
create extension pg_graphql;

-- Auth service fixture: the Postgres image alone does not run GoTrue migrations.
-- These are the columns/functions the membership predicate actually reads.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  deleted_at timestamptz, banned_until timestamptz
);
-- The image includes an early Auth schema, before these hosted GoTrue columns.
alter table auth.users add column if not exists deleted_at timestamptz;
alter table auth.users add column if not exists banned_until timestamptz;
alter table auth.users owner to supabase_auth_admin;
grant all on auth.users to postgres;
grant usage on schema auth to postgres, anon, authenticated, service_role;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select current_setting('request.jwt.claims', true)::jsonb->>'role'
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true),'')::jsonb
$$;
