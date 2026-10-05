-- =====================================================================
-- 001_v2_base_compatibility.sql      SAFE FOR EXISTING V1 DATABASES
-- Additive only: new tables/columns/functions. No DROP TABLE, no DELETE,
-- no TRUNCATE. Idempotent (safe to run twice).
-- Run order: 001 -> 002 -> 003 -> 004 -> 005 -> 006 -> 007
-- =====================================================================

-- @@SCHEMA
create extension if not exists "pgcrypto";

-- V2 notification centre (new table; V1 has none)
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null default 'general',
  title       text not null,
  body        text,
  link        text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id, is_read, created_at desc);

-- Columns V2 reads (all nullable / defaulted, so V1 inserts keep working)
alter table public.timetable      add column if not exists room text;
alter table public.events         add column if not exists start_time time;
alter table public.events         add column if not exists end_time time;
alter table public.events         add column if not exists event_type text not null default 'other';
alter table public.events         add column if not exists audience text not null default 'all';
alter table public.events         add column if not exists registration_required boolean not null default false;
alter table public.notices        add column if not exists publish_date date;
alter table public.leave_requests add column if not exists leave_type text not null default 'personal';
alter table public.leave_requests add column if not exists rejection_reason text;
alter table public.leave_requests add column if not exists decided_at timestamptz;

-- Widen status checks (V1: fee_payments only allowed paid/partial/due). Widening never rejects existing rows.
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
           where c.conrelid = 'public.fee_payments'::regclass and c.contype = 'c'
             and pg_get_constraintdef(c.oid) ilike '%status%' loop
    execute format('alter table public.fee_payments drop constraint %I', r.conname);
  end loop;
  alter table public.fee_payments add constraint fee_payments_status_check
    check (status in ('paid','partial','due','pending_verification','rejected'));
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_event_type_check') then
    alter table public.events add constraint events_event_type_check
      check (event_type in ('exam','meeting','activity','deadline','holiday','other')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_type_check') then
    alter table public.notifications add constraint notifications_type_check
      check (type in ('notice','result','fee','timetable','event','leave','query','attendance','general'));
  end if;
end $$;

-- @@FUNCTIONS
-- Same names/semantics as V1 (create or replace is safe).
create or replace function public.get_my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.in_class(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select cid is not null and (
       exists (select 1 from public.students s where s.class_id = cid and (s.id = auth.uid() or s.parent_id = auth.uid()))
    or exists (select 1 from public.teacher_subjects ts where ts.class_id = cid and ts.teacher_id = auth.uid())
    or exists (select 1 from public.classes c where c.id = cid and c.class_teacher_id = auth.uid())
  );
$$;

create or replace function public.teaches_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    where s.id = sid and (
      exists (select 1 from public.teacher_subjects ts where ts.class_id = s.class_id and ts.teacher_id = auth.uid())
      or exists (select 1 from public.classes c where c.id = s.class_id and c.class_teacher_id = auth.uid())
    )
  );
$$;

create or replace function public.is_parent_of(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.students s where s.id = sid and s.parent_id = auth.uid());
$$;

create or replace function public.can_view_profile(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
       auth.uid() = target
    or public.is_admin()
    or exists (select 1 from public.profiles p where p.id = target and p.role in ('teacher','admin'))
    or exists (select 1 from public.students s where s.id = auth.uid() and s.parent_id = target)
    or exists (select 1 from public.students s where s.id = target and s.parent_id = auth.uid())
    or exists (select 1 from public.students s
               where (s.id = target or s.parent_id = target) and public.teaches_student(s.id));
$$;

-- @@POLICIES
-- Only NEW table policies here. Existing V1 policies are left untouched
-- (see supabase/audit/rls_audit.sql to review them).
alter table public.notifications enable row level security;
drop policy if exists "v2 notifications read own"   on public.notifications;
drop policy if exists "v2 notifications update own" on public.notifications;
drop policy if exists "v2 notifications delete own" on public.notifications;
create policy "v2 notifications read own"   on public.notifications for select using (user_id = auth.uid());
create policy "v2 notifications update own" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "v2 notifications delete own" on public.notifications for delete using (user_id = auth.uid());
-- Users may only flip is_read (not rewrite titles). Inserts come from SECURITY DEFINER triggers.
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;
