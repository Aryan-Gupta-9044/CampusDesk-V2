-- =====================================================================
-- 003_v2_report_support.sql          SAFE FOR EXISTING V1 DATABASES
-- * Human-facing IDs: students.student_code (STU-2026-001), teachers.teacher_code (TCH-2026-001)
--   (UUIDs are never shown to people). Backfills only rows where the code is NULL.
-- * ATTENDANCE POLICY (one definition used everywhere, SQL and UI):
--       attended = present + late
--       counted  = present + late + absent        ('leave' = approved/excused, excluded)
--       percent  = round(100 * attended / counted)  -> NULL when counted = 0
-- * get_student_report(): everything the Academic Report page prints.
-- =====================================================================

-- @@SCHEMA
alter table public.students add column if not exists student_code text;
alter table public.teachers add column if not exists teacher_code text;
create sequence if not exists public.student_code_seq;
create sequence if not exists public.teacher_code_seq;

-- @@FUNCTIONS
create or replace function public.attendance_percent(p_attended bigint, p_counted bigint)
returns integer language sql immutable as $$
  select case when coalesce(p_counted, 0) = 0 then null else round(100.0 * p_attended / p_counted)::int end;
$$;

create or replace function public.grade_for(p numeric)
returns text language sql immutable as $$
  select case when p is null then null when p >= 90 then 'A+' when p >= 80 then 'A' when p >= 70 then 'B'
              when p >= 60 then 'C' when p >= 50 then 'D' else 'F' end;
$$;

create or replace function public.assign_student_code()
returns trigger language plpgsql as $$
begin
  if new.student_code is null then
    new.student_code := 'STU-' || to_char(coalesce(new.admission_date, current_date), 'YYYY') || '-' ||
                        to_char(nextval('public.student_code_seq'), 'FM000');
  end if;
  return new;
end $$;

create or replace function public.assign_teacher_code()
returns trigger language plpgsql as $$
begin
  if new.teacher_code is null then
    new.teacher_code := 'TCH-' || to_char(coalesce(new.joining_date, current_date), 'YYYY') || '-' ||
                        to_char(nextval('public.teacher_code_seq'), 'FM000');
  end if;
  return new;
end $$;

-- Report payload. Students/parents only ever see PUBLISHED results; staff see marks as entered.
create or replace function public.get_student_report(p_student uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_staff boolean; v jsonb;
begin
  if not (auth.uid() = p_student or public.is_admin() or public.is_parent_of(p_student) or public.teaches_student(p_student)) then
    raise exception 'campusdesk:not_allowed' using errcode = '42501';
  end if;
  v_staff := public.is_admin() or public.teaches_student(p_student);

  select jsonb_build_object(
    'generated_at', now(),
    'student', jsonb_build_object(
        'id', s.id, 'student_code', s.student_code, 'roll_no', s.roll_no, 'name', sp.full_name,
        'email', sp.email, 'phone', sp.phone, 'dob', s.dob, 'gender', s.gender,
        'class_name', c.name, 'section', c.section, 'academic_year', c.academic_year),
    'class_teacher', case when ct.id is null then null else jsonb_build_object(
        'name', ctp.full_name, 'email', ctp.email, 'phone', ctp.phone, 'teacher_code', ct.teacher_code) end,
    'guardian', case when pp.id is null then null else jsonb_build_object(
        'name', pp.full_name, 'email', pp.email, 'phone', pp.phone) end,
    'attendance', coalesce((
        select jsonb_agg(jsonb_build_object('subject', x.subject, 'present', x.present, 'late', x.late,
                                            'absent', x.absent, 'leave', x.leave_n) order by x.subject)
        from (select coalesce(sb.name, 'Unassigned') as subject,
                     count(*) filter (where a.status = 'present') as present,
                     count(*) filter (where a.status = 'late') as late,
                     count(*) filter (where a.status = 'absent') as absent,
                     count(*) filter (where a.status = 'leave') as leave_n
              from public.attendance a left join public.subjects sb on sb.id = a.subject_id
              where a.student_id = s.id group by sb.name) x), '[]'::jsonb),
    'marks', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'exam', e.name, 'term', e.term, 'exam_date', e.start_date, 'subject', sb.name,
                 'obtained', m.marks_obtained, 'max', m.max_marks,
                 'percentage', round(100.0 * m.marks_obtained / nullif(m.max_marks, 0), 1),
                 'grade', public.grade_for(100.0 * m.marks_obtained / nullif(m.max_marks, 0)))
               order by e.start_date nulls last, e.name, sb.name)
        from public.marks m
        join public.exams e on e.id = m.exam_id
        join public.subjects sb on sb.id = m.subject_id
        where m.student_id = s.id
          and (v_staff or exists (select 1 from public.results r where r.student_id = m.student_id and r.exam_id = m.exam_id and r.published))
    ), '[]'::jsonb),
    'results', coalesce((
        select jsonb_agg(jsonb_build_object('exam', e.name, 'term', e.term, 'exam_date', e.start_date,
                 'total', r.total_marks, 'percentage', r.percentage, 'grade', r.grade, 'rank', r.rank, 'published', r.published)
               order by e.start_date nulls last, e.name)
        from public.results r join public.exams e on e.id = r.exam_id
        where r.student_id = s.id and (v_staff or r.published)), '[]'::jsonb)
  ) into v
  from public.students s
  join public.profiles sp on sp.id = s.id
  left join public.classes c on c.id = s.class_id
  left join public.teachers ct on ct.id = c.class_teacher_id
  left join public.profiles ctp on ctp.id = ct.id
  left join public.profiles pp on pp.id = s.parent_id
  where s.id = p_student;

  if v is null then raise exception 'campusdesk:not_found' using errcode = 'P0001'; end if;
  return v;
end $$;

-- @@TRIGGERS
drop trigger if exists students_assign_code on public.students;
create trigger students_assign_code before insert on public.students
  for each row execute procedure public.assign_student_code();
drop trigger if exists teachers_assign_code on public.teachers;
create trigger teachers_assign_code before insert on public.teachers
  for each row execute procedure public.assign_teacher_code();

-- @@SCHEMA
-- Backfill codes for existing rows (only NULL ones; oldest first). Never overwrites a code.
do $$
declare r record;
begin
  for r in select id, admission_date from public.students where student_code is null order by admission_date nulls last, id loop
    update public.students set student_code = 'STU-' || to_char(coalesce(r.admission_date, current_date), 'YYYY') || '-' ||
           to_char(nextval('public.student_code_seq'), 'FM000') where id = r.id;
  end loop;
  for r in select id, joining_date from public.teachers where teacher_code is null order by joining_date nulls last, id loop
    update public.teachers set teacher_code = 'TCH-' || to_char(coalesce(r.joining_date, current_date), 'YYYY') || '-' ||
           to_char(nextval('public.teacher_code_seq'), 'FM000') where id = r.id;
  end loop;
end $$;
create unique index if not exists uq_students_code on public.students(student_code) where student_code is not null;
create unique index if not exists uq_teachers_code on public.teachers(teacher_code) where teacher_code is not null;
