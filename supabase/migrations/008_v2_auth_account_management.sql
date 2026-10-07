-- =====================================================================
-- 008_v2_auth_account_management.sql      FOR EXISTING V1 / V2 DATABASES
-- Registration -> admin approval -> role assignment -> entity provisioning -> activation.
--
-- REQUIRES 001-007 (uses is_seeding(), push helpers, notifications, audit_logs).
-- DO NOT run 900_OPTIONAL_security_hardening.sql afterwards: this file supersedes it, and 900
-- would re-install V1's handle_new_user() and break the approval flow.
--
-- ADDITIVE + IDEMPOTENT. No DROP TABLE / TRUNCATE; no existing profile, student, teacher or
-- relationship row is modified: every existing account keeps its role and stays 'active'.
--
-- WHAT IT CHANGES (read this before running)
--  1. profiles gains: requested_role, decided_by, decided_at, rejection_reason, status_reason.
--  2. profiles.status check widened:  active | suspended  ->  + pending | rejected | incomplete.
--  3. handle_new_user() REPLACED. V1 trusted a client-supplied `role` in signup metadata (anyone could
--     sign up as admin through the Auth API). Now every new account is created `pending`; a requested
--     role (student/parent/teacher only) is stored in requested_role and NEVER becomes the role.
--     V1 behaviour can be restored per-project with the opt-in setting
--     `allow_legacy_signup_role` (see campusdesk_settings) - it can never create an admin.
--  4. guard_profile_update trigger: non-admins cannot change id/role/status/requested_role/decision fields
--     and cannot INSERT profiles (closes V1's unrestricted "user updates own profile" policy).
--  5. get_my_role() / is_admin() now require status = 'active' (a suspended admin is no longer an admin).
--  6. RESTRICTIVE policies: pending / rejected / suspended / incomplete accounts cannot read or write any
--     application table (profiles: only their own row). V1's "authenticated users read all profiles"
--     policy previously exposed every email/phone to any logged-in account.
--  7. New admin-only functions (atomic, SECURITY DEFINER, fixed search_path, explicit admin check):
--     admin_list_accounts, admin_account_counts, admin_get_account, admin_provision_account,
--     admin_reject_account, admin_suspend_account, admin_reactivate_account, admin_promote_to_admin;
--     and my_account_state() for the logged-in user.
--  8. New table campusdesk_settings (admin-only).
--  9. assign_student_code()/assign_teacher_code() redefined as SECURITY DEFINER (same logic).
--
-- V1 COMPATIBILITY: existing users unaffected. Behaviour changes for the V1 app on this database:
--   * V1's "Create account" page (and V1's browser-side "add teacher/parent" flow) now yields a PENDING
--     account instead of an active role account - approve it in V2 (Accounts & requests), or set
--     allow_legacy_signup_role = 'true' while V1 is still in use.
--   * V1 suspended users are now also blocked at the database (previously only by the app).
--
-- ROLLBACK: restore V1 handle_new_user() from V1 supabase_schema.sql; drop trigger guard_profile_update;
--   drop policy v2_require_active_account on each table (and v2_profiles_active_or_self); re-create
--   get_my_role()/is_admin() without the status test. Columns/functions can stay (unused).
-- =====================================================================

-- @@SCHEMA
alter table public.profiles add column if not exists created_at       timestamptz not null default now();
alter table public.profiles add column if not exists requested_role   text;
alter table public.profiles add column if not exists decided_by       uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists decided_at       timestamptz;
alter table public.profiles add column if not exists rejection_reason text;
alter table public.profiles add column if not exists status_reason    text;

do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
           where c.conrelid = 'public.profiles'::regclass and c.contype = 'c'
             and pg_get_constraintdef(c.oid) ilike '%status%' loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
  alter table public.profiles add constraint profiles_status_check
    check (status in ('pending','active','suspended','rejected','incomplete'));

  if not exists (select 1 from pg_constraint where conname = 'profiles_requested_role_check') then
    alter table public.profiles add constraint profiles_requested_role_check
      check (requested_role is null or requested_role in ('student','parent','teacher'));
  end if;

  -- notification type for account events
  alter table public.notifications drop constraint if exists notifications_type_check;
  alter table public.notifications add constraint notifications_type_check
    check (type in ('notice','result','fee','timetable','event','leave','query','attendance','account','general'));
end $$;

create index if not exists idx_profiles_status_created on public.profiles(status, created_at desc);

create table if not exists public.campusdesk_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
insert into public.campusdesk_settings (key, value) values ('allow_legacy_signup_role', 'false')
  on conflict (key) do nothing;

-- @@FUNCTIONS
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.get_my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active';
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

-- ID-assigning triggers run with owner rights so a legitimate insert never fails on sequence privileges
-- (003 defined them without SECURITY DEFINER; behaviour is otherwise identical).
create or replace function public.assign_student_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.student_code is null then
    new.student_code := 'STU-' || to_char(coalesce(new.admission_date, current_date), 'YYYY') || '-' || to_char(nextval('public.student_code_seq'), 'FM000');
  end if;
  return new;
end $$;

create or replace function public.assign_teacher_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.teacher_code is null then
    new.teacher_code := 'TCH-' || to_char(coalesce(new.joining_date, current_date), 'YYYY') || '-' || to_char(nextval('public.teacher_code_seq'), 'FM000');
  end if;
  return new;
end $$;

-- Every new Auth user becomes a PENDING profile. Client-supplied role/status are never used.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_req text; v_role text := 'student'; v_status text := 'pending'; v_legacy boolean := false;
  v_name text := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
begin
  v_req := lower(nullif(trim(coalesce(new.raw_user_meta_data->>'requested_role', '')), ''));
  if v_req is null or v_req not in ('student','parent','teacher') then v_req := null; end if;   -- 'admin' etc. ignored

  select coalesce(value = 'true', false) into v_legacy from public.campusdesk_settings where key = 'allow_legacy_signup_role';
  if coalesce(v_legacy, false) and lower(coalesce(new.raw_user_meta_data->>'role', '')) in ('student','parent','teacher') then
    v_role := lower(new.raw_user_meta_data->>'role'); v_status := 'active'; v_req := coalesce(v_req, v_role);   -- opt-in V1 behaviour, never admin
  end if;

  insert into public.profiles (id, role, status, full_name, email, phone, requested_role)
  values (new.id, v_role, v_status, v_name, new.email, nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), ''), v_req)
  on conflict (id) do nothing;

  if v_status = 'pending' and not public.is_seeding() then
    insert into public.notifications (user_id, type, title, body, link)
    select p.id, 'account', 'New registration request',
           coalesce(v_name, new.email) || ' registered' || coalesce(' and requested a ' || v_req || ' account', '') || '.',
           '/account-requests'
    from public.profiles p where p.role = 'admin' and p.status = 'active';
    insert into public.audit_logs (actor_id, action, target_table, target_id, details)
    values (new.id, 'account_registered', 'profiles', new.id, jsonb_build_object('requested_role', v_req, 'email', new.email));
  end if;
  return new;
end $$;

-- Only administrators may change identity / role / approval fields, or create profiles from a client.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;           -- SQL editor, service role, auth trigger
  if public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then raise exception 'campusdesk:role_locked' using errcode = '42501'; end if;
  if new.id is distinct from old.id or new.role is distinct from old.role or new.status is distinct from old.status
     or new.requested_role is distinct from old.requested_role or new.decided_by is distinct from old.decided_by
     or new.decided_at is distinct from old.decided_at or new.rejection_reason is distinct from old.rejection_reason
     or new.status_reason is distinct from old.status_reason then
    raise exception 'campusdesk:role_locked' using errcode = '42501';
  end if;
  return new;
end $$;

-- State of the logged-in account (works for pending/suspended users; they cannot read other tables)
create or replace function public.my_account_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.profiles; v_ok boolean := true;
begin
  if auth.uid() is null then return jsonb_build_object('exists', false); end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then return jsonb_build_object('exists', false); end if;
  if p.role = 'student' then v_ok := exists (select 1 from public.students where id = p.id);
  elsif p.role = 'teacher' then v_ok := exists (select 1 from public.teachers where id = p.id); end if;
  return jsonb_build_object('exists', true, 'status', p.status, 'role', p.role, 'requested_role', p.requested_role,
    'full_name', p.full_name, 'email', p.email, 'rejection_reason', p.rejection_reason,
    'status_reason', p.status_reason, 'entity_ok', v_ok, 'created_at', p.created_at);
end $$;

create or replace function public.admin_account_counts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  return (select jsonb_build_object(
    'total', count(*),
    'pending', count(*) filter (where status = 'pending'), 'active', count(*) filter (where status = 'active'),
    'suspended', count(*) filter (where status = 'suspended'), 'rejected', count(*) filter (where status = 'rejected'),
    'incomplete', count(*) filter (where status = 'incomplete'),
    'students', count(*) filter (where status = 'active' and role = 'student'),
    'teachers', count(*) filter (where status = 'active' and role = 'teacher'),
    'parents',  count(*) filter (where status = 'active' and role = 'parent'),
    'admins',   count(*) filter (where status = 'active' and role = 'admin')) from public.profiles);
end $$;

create or replace function public.admin_list_accounts(
  p_status text default null, p_role text default null, p_search text default null,
  p_limit int default 50, p_offset int default 0)
returns table (id uuid, full_name text, email text, phone text, role text, requested_role text, status text,
               created_at timestamptz, decided_at timestamptz, rejection_reason text,
               entity_code text, entity_detail text, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  return query
  select p.id, p.full_name, p.email, p.phone, p.role, p.requested_role, p.status, p.created_at, p.decided_at, p.rejection_reason,
         coalesce(s.student_code, t.teacher_code, t.employee_id),
         case when p.status in ('pending','rejected') then null
              when p.role = 'student' and s.id is not null then coalesce('Class ' || c.name || '-' || c.section, 'No class')
              when p.role = 'teacher' and t.id is not null then coalesce(t.department, 'No department')
              when p.role = 'parent' then (select count(*)::text || ' child(ren)' from public.students k where k.parent_id = p.id)
              else null end,
         count(*) over ()
  from public.profiles p
  left join public.students s on s.id = p.id
  left join public.classes c on c.id = s.class_id
  left join public.teachers t on t.id = p.id
  where (p_status is null or p.status = p_status)
    and (p_role is null or case when p.status in ('pending','rejected') then p.requested_role = p_role else p.role = p_role end)
    and (p_search is null or p_search = '' or p.full_name ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%'
         or p.phone ilike '%' || p_search || '%' or s.student_code ilike '%' || p_search || '%' or s.roll_no ilike '%' || p_search || '%'
         or t.teacher_code ilike '%' || p_search || '%' or t.employee_id ilike '%' || p_search || '%')
  order by (p.status = 'pending') desc, p.created_at desc nulls last
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_get_account(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  select jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'email', p.email, 'phone', p.phone, 'role', p.role, 'status', p.status,
    'requested_role', p.requested_role, 'created_at', p.created_at, 'decided_at', p.decided_at,
    'rejection_reason', p.rejection_reason, 'status_reason', p.status_reason,
    'decided_by_name', (select full_name from public.profiles where id = p.decided_by),
    'student', (select to_jsonb(s) from public.students s where s.id = p.id),
    'teacher', (select to_jsonb(t) from public.teachers t where t.id = p.id),
    'children', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', kp.full_name, 'roll_no', k.roll_no,
                 'class', c.name || '-' || c.section)) from public.students k join public.profiles kp on kp.id = k.id
                 left join public.classes c on c.id = k.class_id where k.parent_id = p.id), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object('class_id', ts.class_id, 'subject_id', ts.subject_id,
                 'class', c.name || '-' || c.section, 'subject', sb.name)) from public.teacher_subjects ts
                 join public.classes c on c.id = ts.class_id join public.subjects sb on sb.id = ts.subject_id
                 where ts.teacher_id = p.id), '[]'::jsonb),
    'class_teacher_of', coalesce((select jsonb_agg(c.id) from public.classes c where c.class_teacher_id = p.id), '[]'::jsonb)
  ) into v from public.profiles p where p.id = p_user;
  if v is null then raise exception 'campusdesk:not_found' using errcode = 'P0001'; end if;
  return v;
end $$;

-- APPROVE / PROVISION. One transaction: any failure rolls back everything (no half-provisioned accounts).
--   p_activate = true  -> validates required fields, creates entity + relationships, status 'active'
--   p_activate = false -> role assigned, whatever was supplied is saved, status 'incomplete'
-- p_data keys. student: roll_no, class_id, dob, gender, address, admission_date, parent_id
--              parent : child_ids [uuid]       teacher: employee_id, department, qualification, joining_date,
--                       assignments [{class_id, subject_id}], class_teacher_of [class_id]
create or replace function public.admin_provision_account(
  p_user uuid, p_role text, p_data jsonb default '{}'::jsonb, p_activate boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid(); p public.profiles; v_prev_status text; v_prev_role text;
  v_roll text; v_class uuid; v_parent uuid; v_emp text; v_dept text; v_child uuid; v_children uuid[]; v_a jsonb; v_cid uuid;
  v_new_status text := case when p_activate then 'active' else 'incomplete' end;
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  p_data := coalesce(p_data, '{}'::jsonb);
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'campusdesk:not_found' using errcode = 'P0001'; end if;
  if p_user = v_admin then raise exception 'campusdesk:cannot_modify_self' using errcode = 'P0001'; end if;
  if p.role = 'admin' and p.status in ('active','suspended') then raise exception 'campusdesk:use_admin_tools' using errcode = 'P0001'; end if;
  if p_role not in ('student','parent','teacher') then raise exception 'campusdesk:invalid_role' using errcode = 'P0001'; end if;
  v_prev_status := p.status; v_prev_role := p.role;

  -- changing the role of an account that already has records would orphan data: block it
  if p.status in ('active','suspended','incomplete') and p.role <> p_role then
    if (p.role = 'student' and (exists (select 1 from public.attendance where student_id = p.id) or exists (select 1 from public.marks where student_id = p.id)
                                or exists (select 1 from public.fee_payments where student_id = p.id)))
       or (p.role = 'teacher' and (exists (select 1 from public.teacher_subjects where teacher_id = p.id) or exists (select 1 from public.timetable where teacher_id = p.id)
                                   or exists (select 1 from public.classes where class_teacher_id = p.id)))
       or (p.role = 'parent' and exists (select 1 from public.students where parent_id = p.id)) then
      raise exception 'campusdesk:role_change_blocked' using errcode = 'P0001';
    end if;
  end if;

  if p_role = 'student' then
    v_roll := nullif(trim(p_data->>'roll_no'), ''); v_class := nullif(p_data->>'class_id', '')::uuid;
    v_parent := nullif(p_data->>'parent_id', '')::uuid;
    if p_activate and (v_roll is null and not exists (select 1 from public.students where id = p_user and roll_no is not null)
                       or v_class is null and not exists (select 1 from public.students where id = p_user and class_id is not null)) then
      raise exception 'campusdesk:student_fields_required' using errcode = 'P0001'; end if;
    if v_class is not null and not exists (select 1 from public.classes where id = v_class) then raise exception 'campusdesk:class_not_found' using errcode = 'P0001'; end if;
    if v_parent is not null and not exists (select 1 from public.profiles where id = v_parent and role = 'parent') then raise exception 'campusdesk:parent_not_found' using errcode = 'P0001'; end if;
    if v_roll is not null and exists (select 1 from public.students where roll_no = v_roll and id <> p_user) then raise exception 'campusdesk:roll_exists' using errcode = 'P0001'; end if;
    insert into public.students (id, roll_no, class_id, dob, gender, address, admission_date, parent_id)
    values (p_user, v_roll, v_class, nullif(p_data->>'dob', '')::date, nullif(p_data->>'gender', ''), nullif(p_data->>'address', ''),
            coalesce(nullif(p_data->>'admission_date', '')::date, current_date), v_parent)
    on conflict (id) do update set
      roll_no = case when p_data ? 'roll_no' then v_roll else public.students.roll_no end,
      class_id = case when p_data ? 'class_id' then v_class else public.students.class_id end,
      dob = case when p_data ? 'dob' then nullif(p_data->>'dob', '')::date else public.students.dob end,
      gender = case when p_data ? 'gender' then nullif(p_data->>'gender', '') else public.students.gender end,
      address = case when p_data ? 'address' then nullif(p_data->>'address', '') else public.students.address end,
      admission_date = case when p_data ? 'admission_date' then coalesce(nullif(p_data->>'admission_date', '')::date, public.students.admission_date) else public.students.admission_date end,
      parent_id = case when p_data ? 'parent_id' then v_parent else public.students.parent_id end;
    insert into public.audit_logs (actor_id, action, target_table, target_id, details)
    values (v_admin, 'student_provisioned', 'students', p_user, jsonb_build_object('roll_no', v_roll, 'class_id', v_class, 'parent_id', v_parent));
    if v_parent is not null then
      insert into public.audit_logs (actor_id, action, target_table, target_id, details) values (v_admin, 'parent_linked', 'students', p_user, jsonb_build_object('parent_id', v_parent));
    end if;

  elsif p_role = 'parent' then
    if p_data ? 'child_ids' then
      select coalesce(array_agg(x::uuid), '{}') into v_children from jsonb_array_elements_text(p_data->'child_ids') x;
    else
      select coalesce(array_agg(id), '{}') into v_children from public.students where parent_id = p_user;
    end if;
    if p_activate and cardinality(v_children) = 0 then raise exception 'campusdesk:parent_children_required' using errcode = 'P0001'; end if;
    foreach v_child in array v_children loop
      if not exists (select 1 from public.students where id = v_child) then raise exception 'campusdesk:child_not_found' using errcode = 'P0001'; end if;
      if exists (select 1 from public.students where id = v_child and parent_id is not null and parent_id <> p_user) then raise exception 'campusdesk:child_has_parent' using errcode = 'P0001'; end if;
      update public.students set parent_id = p_user where id = v_child and parent_id is distinct from p_user;
      if found then insert into public.audit_logs (actor_id, action, target_table, target_id, details) values (v_admin, 'parent_linked', 'students', v_child, jsonb_build_object('parent_id', p_user)); end if;
    end loop;
    if p_data ? 'child_ids' then
      update public.students set parent_id = null where parent_id = p_user and not (id = any (v_children));
    end if;

  elsif p_role = 'teacher' then
    v_emp := nullif(trim(p_data->>'employee_id'), ''); v_dept := nullif(trim(p_data->>'department'), '');
    if p_activate and (v_emp is null and not exists (select 1 from public.teachers where id = p_user and employee_id is not null)
                       or v_dept is null and not exists (select 1 from public.teachers where id = p_user and department is not null)) then
      raise exception 'campusdesk:teacher_fields_required' using errcode = 'P0001'; end if;
    if v_emp is not null and exists (select 1 from public.teachers where employee_id = v_emp and id <> p_user) then raise exception 'campusdesk:employee_exists' using errcode = 'P0001'; end if;
    insert into public.teachers (id, employee_id, department, qualification, joining_date)
    values (p_user, v_emp, v_dept, nullif(p_data->>'qualification', ''), nullif(p_data->>'joining_date', '')::date)
    on conflict (id) do update set
      employee_id = case when p_data ? 'employee_id' then v_emp else public.teachers.employee_id end,
      department = case when p_data ? 'department' then v_dept else public.teachers.department end,
      qualification = case when p_data ? 'qualification' then nullif(p_data->>'qualification', '') else public.teachers.qualification end,
      joining_date = case when p_data ? 'joining_date' then nullif(p_data->>'joining_date', '')::date else public.teachers.joining_date end;

    if p_data ? 'assignments' then
      for v_a in select * from jsonb_array_elements(p_data->'assignments') loop
        if not exists (select 1 from public.subjects where id = (v_a->>'subject_id')::uuid and class_id = (v_a->>'class_id')::uuid) then
          raise exception 'campusdesk:invalid_assignment' using errcode = 'P0001'; end if;
      end loop;
      delete from public.teacher_subjects ts where ts.teacher_id = p_user and not exists (
        select 1 from jsonb_array_elements(p_data->'assignments') a
         where (a->>'class_id')::uuid = ts.class_id and (a->>'subject_id')::uuid = ts.subject_id);
      insert into public.teacher_subjects (teacher_id, subject_id, class_id)
      select p_user, (a->>'subject_id')::uuid, (a->>'class_id')::uuid from jsonb_array_elements(p_data->'assignments') a
       where not exists (select 1 from public.teacher_subjects ts where ts.teacher_id = p_user
                         and ts.class_id = (a->>'class_id')::uuid and ts.subject_id = (a->>'subject_id')::uuid);
    end if;
    if p_data ? 'class_teacher_of' then
      for v_cid in select x::uuid from jsonb_array_elements_text(p_data->'class_teacher_of') x loop
        if not exists (select 1 from public.classes where id = v_cid) then raise exception 'campusdesk:class_not_found' using errcode = 'P0001'; end if;
        if exists (select 1 from public.classes where id = v_cid and class_teacher_id is not null and class_teacher_id <> p_user) then raise exception 'campusdesk:class_has_teacher' using errcode = 'P0001'; end if;
        update public.classes set class_teacher_id = p_user where id = v_cid;
      end loop;
      update public.classes set class_teacher_id = null where class_teacher_id = p_user
         and id not in (select x::uuid from jsonb_array_elements_text(p_data->'class_teacher_of') x);
    end if;
    insert into public.audit_logs (actor_id, action, target_table, target_id, details)
    values (v_admin, 'teacher_provisioned', 'teachers', p_user, jsonb_build_object('employee_id', v_emp, 'department', v_dept));
  end if;

  update public.profiles set role = p_role, status = v_new_status, decided_by = v_admin, decided_at = now(),
         rejection_reason = null, status_reason = null where id = p_user;

  if v_prev_role is distinct from p_role or v_prev_status in ('pending','rejected') then
    insert into public.audit_logs (actor_id, action, target_table, target_id, details)
    values (v_admin, 'role_assigned', 'profiles', p_user, jsonb_build_object('role', p_role, 'requested_role', p.requested_role));
  end if;
  insert into public.audit_logs (actor_id, action, target_table, target_id, details)
  values (v_admin, case when p_activate then 'account_approved' else 'account_setup_incomplete' end, 'profiles', p_user,
          jsonb_build_object('role', p_role, 'previous_status', v_prev_status));
  if v_prev_status is distinct from v_new_status then
    insert into public.notifications (user_id, type, title, body, link)
    values (p_user, 'account',
            case when p_activate then 'Your CampusDesk account has been approved' else 'Your account setup is not finished yet' end,
            case when p_activate then 'You can now use CampusDesk as a ' || p_role || '.' else 'An administrator still needs to complete your ' || p_role || ' details.' end, '/');
  end if;
  return jsonb_build_object('id', p_user, 'role', p_role, 'status', v_new_status);
end $$;

create or replace function public.admin_reject_account(p_user uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'campusdesk:not_found' using errcode = 'P0001'; end if;
  if p_user = auth.uid() then raise exception 'campusdesk:cannot_modify_self' using errcode = 'P0001'; end if;
  if p.status not in ('pending','incomplete') then raise exception 'campusdesk:not_rejectable' using errcode = 'P0001'; end if;
  update public.profiles set status = 'rejected', rejection_reason = nullif(trim(coalesce(p_reason, '')), ''),
         decided_by = auth.uid(), decided_at = now() where id = p_user;
  insert into public.audit_logs (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'account_rejected', 'profiles', p_user, jsonb_build_object('reason', p_reason));
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user, 'account', 'Your CampusDesk registration was not approved', coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Please contact the school office.'), '/');
  return jsonb_build_object('id', p_user, 'status', 'rejected');
end $$;

create or replace function public.admin_suspend_account(p_user uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'campusdesk:not_found' using errcode = 'P0001'; end if;
  if p_user = auth.uid() then raise exception 'campusdesk:cannot_modify_self' using errcode = 'P0001'; end if;
  if p.status <> 'active' then raise exception 'campusdesk:not_active' using errcode = 'P0001'; end if;
  if p.role = 'admin' and not exists (select 1 from public.profiles where role = 'admin' and status = 'active' and id <> p_user) then
    raise exception 'campusdesk:last_admin' using errcode = 'P0001'; end if;
  update public.profiles set status = 'suspended', status_reason = nullif(trim(coalesce(p_reason, '')), ''), decided_by = auth.uid(), decided_at = now() where id = p_user;
  insert into public.audit_logs (actor_id, action, target_table, target_id, details) values (auth.uid(), 'account_suspended', 'profiles', p_user, jsonb_build_object('reason', p_reason));
  insert into public.notifications (user_id, type, title, body, link) values (p_user, 'account', 'Your account has been suspended', coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Contact the school office for details.'), '/');
  return jsonb_build_object('id', p_user, 'status', 'suspended');
end $$;

create or replace function public.admin_reactivate_account(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.profiles; v_status text := 'active';
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'campusdesk:not_found' using errcode = 'P0001'; end if;
  if p.status <> 'suspended' then raise exception 'campusdesk:not_suspended' using errcode = 'P0001'; end if;
  if (p.role = 'student' and not exists (select 1 from public.students where id = p_user))
     or (p.role = 'teacher' and not exists (select 1 from public.teachers where id = p_user)) then v_status := 'incomplete'; end if;
  update public.profiles set status = v_status, status_reason = null, decided_by = auth.uid(), decided_at = now() where id = p_user;
  insert into public.audit_logs (actor_id, action, target_table, target_id, details) values (auth.uid(), 'account_reactivated', 'profiles', p_user, jsonb_build_object('status', v_status));
  insert into public.notifications (user_id, type, title, body, link) values (p_user, 'account', 'Your account has been reactivated', 'You can log in again.', '/');
  return jsonb_build_object('id', p_user, 'status', v_status);
end $$;

-- The ONLY way to create an administrator: an existing active admin promotes an existing active account.
create or replace function public.admin_promote_to_admin(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'campusdesk:not_found' using errcode = 'P0001'; end if;
  if p.status <> 'active' then raise exception 'campusdesk:not_active' using errcode = 'P0001'; end if;
  if p.role = 'admin' then raise exception 'campusdesk:already_admin' using errcode = 'P0001'; end if;
  update public.profiles set role = 'admin', decided_by = auth.uid(), decided_at = now() where id = p_user;
  insert into public.audit_logs (actor_id, action, target_table, target_id, details) values (auth.uid(), 'admin_promoted', 'profiles', p_user, jsonb_build_object('previous_role', p.role));
  return jsonb_build_object('id', p_user, 'role', 'admin');
end $$;

revoke execute on function public.admin_account_counts(), public.admin_list_accounts(text, text, text, int, int), public.admin_get_account(uuid),
  public.admin_provision_account(uuid, text, jsonb, boolean), public.admin_reject_account(uuid, text), public.admin_suspend_account(uuid, text),
  public.admin_reactivate_account(uuid), public.admin_promote_to_admin(uuid) from public;
revoke execute on function public.my_account_state() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.admin_account_counts(), public.admin_list_accounts(text, text, text, int, int), public.admin_get_account(uuid),
      public.admin_provision_account(uuid, text, jsonb, boolean), public.admin_reject_account(uuid, text), public.admin_suspend_account(uuid, text),
      public.admin_reactivate_account(uuid), public.admin_promote_to_admin(uuid), public.my_account_state() to authenticated;
  end if;
end $$;

-- @@TRIGGERS
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update before insert or update on public.profiles for each row execute procedure public.guard_profile_update();

-- @@POLICIES
alter table public.campusdesk_settings enable row level security;
drop policy if exists "v2 settings admin" on public.campusdesk_settings;
create policy "v2 settings admin" on public.campusdesk_settings for all using (public.is_admin()) with check (public.is_admin());

-- Accounts that are not 'active' (pending / rejected / suspended / incomplete) get NO application data.
-- RESTRICTIVE policies are AND-ed with every existing permissive policy, so V1's policies stay as they are.
do $$
declare r record;
begin
  for r in select tablename from pg_tables
           where schemaname = 'public' and rowsecurity and tablename not in ('profiles', 'notifications', 'campusdesk_settings') loop
    execute format('drop policy if exists v2_require_active_account on public.%I', r.tablename);
    execute format('create policy v2_require_active_account on public.%I as restrictive for all using (public.is_active_user()) with check (public.is_active_user())', r.tablename);
  end loop;
end $$;
drop policy if exists v2_profiles_active_or_self on public.profiles;
create policy v2_profiles_active_or_self on public.profiles as restrictive for select
  using (id = auth.uid() or public.is_active_user());
