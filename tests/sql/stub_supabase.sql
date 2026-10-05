-- Minimal stand-in for Supabase auth/storage so the SQL can be tested on plain PostgreSQL. TEST DATABASES ONLY.
do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if; end $$;
-- Minimal Supabase stand-in for validating SQL locally

create schema auth; create schema storage; create extension if not exists pgcrypto;
create table auth.users (instance_id uuid, id uuid primary key default gen_random_uuid(), aud text, role text, email text unique, encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz, confirmation_token text, email_change text, email_change_token_new text, recovery_token text, last_sign_in_at timestamptz);
create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid references auth.users(id) on delete cascade, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif((nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub'), ''))::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
grant usage on schema public, auth, storage to anon, authenticated;
