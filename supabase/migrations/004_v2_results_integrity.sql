-- =====================================================================
-- 004_v2_results_integrity.sql       SAFE FOR EXISTING V1 DATABASES
-- * Missing marks are NEVER turned into 0 / F. A student is "evaluated" only when
--   marks exist for EVERY subject of the exam's class; otherwise "incomplete".
-- * exam_result_status(): pre-publish summary (students / evaluated / incomplete / avg / high / low)
-- * publish_exam_results(): admin only, refuses incomplete data unless explicitly confirmed;
--   incomplete students get NO visible result.
-- * class_exam_averages(): aggregate-only class averages for "student vs class" charts.
-- =====================================================================

-- @@FUNCTIONS
create or replace function public.exam_result_status(p_exam uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_class uuid; v_expected int; v jsonb;
begin
  select class_id into v_class from public.exams where id = p_exam;
  if v_class is null then raise exception 'campusdesk:not_found' using errcode = 'P0001'; end if;
  if not (public.is_admin() or public.in_class(v_class) and public.get_my_role() = 'teacher') then
    raise exception 'campusdesk:not_allowed' using errcode = '42501';
  end if;
  select count(*) into v_expected from public.subjects where class_id = v_class;

  with per as (
    select s.id as student_id,
           (select count(distinct m.subject_id) from public.marks m
              join public.subjects sb on sb.id = m.subject_id and sb.class_id = v_class
             where m.student_id = s.id and m.exam_id = p_exam) as have,
           (select round(100.0 * sum(m.marks_obtained) / nullif(sum(m.max_marks), 0), 1) from public.marks m
              where m.student_id = s.id and m.exam_id = p_exam) as pct
    from public.students s where s.class_id = v_class)
  select jsonb_build_object(
      'exam_id', p_exam, 'expected_subjects', v_expected,
      'students', count(*),
      'evaluated', count(*) filter (where v_expected > 0 and have = v_expected),
      'incomplete', count(*) filter (where not (v_expected > 0 and have = v_expected)),
      'average', round(avg(pct) filter (where v_expected > 0 and have = v_expected), 1),
      'highest', max(pct) filter (where v_expected > 0 and have = v_expected),
      'lowest',  min(pct) filter (where v_expected > 0 and have = v_expected),
      'published', (select count(*) from public.results r where r.exam_id = p_exam and r.published))
  into v from per;
  return v;
end $$;

create or replace function public.publish_exam_results(p_exam uuid, p_allow_incomplete boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_class uuid; v_expected int; v_status jsonb;
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  select class_id into v_class from public.exams where id = p_exam;
  if v_class is null then raise exception 'campusdesk:not_found' using errcode = 'P0001'; end if;
  select count(*) into v_expected from public.subjects where class_id = v_class;
  if v_expected = 0 then raise exception 'campusdesk:no_subjects' using errcode = 'P0001'; end if;

  v_status := public.exam_result_status(p_exam);
  if (v_status->>'incomplete')::int > 0 and not p_allow_incomplete then
    raise exception 'campusdesk:incomplete_results' using errcode = 'P0001', detail = v_status::text;
  end if;

  -- evaluated students: compute and publish
  insert into public.results (student_id, exam_id, total_marks, percentage, grade, rank, published)
  select t.student_id, p_exam, t.total, t.pct, public.grade_for(t.pct),
         (rank() over (order by t.pct desc))::int, true
  from (
    select m.student_id, sum(m.marks_obtained) as total,
           round(100.0 * sum(m.marks_obtained) / nullif(sum(m.max_marks), 0), 1) as pct
    from public.marks m
    join public.students s on s.id = m.student_id and s.class_id = v_class
    where m.exam_id = p_exam
    group by m.student_id
    having count(distinct m.subject_id) filter (where m.subject_id in (select id from public.subjects where class_id = v_class)) = v_expected
  ) t
  on conflict (student_id, exam_id) do update
    set total_marks = excluded.total_marks, percentage = excluded.percentage, grade = excluded.grade,
        rank = excluded.rank, published = true;

  -- incomplete students: make sure no (possibly stale/zero) result is visible. Rows are kept, just hidden.
  update public.results r set published = false, rank = null
   where r.exam_id = p_exam and r.published
     and r.student_id in (select s.id from public.students s where s.class_id = v_class)
     and not exists (
        select 1 from public.marks m where m.student_id = r.student_id and m.exam_id = p_exam
        group by m.student_id having count(distinct m.subject_id) = v_expected);

  insert into public.audit_logs (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'publish_results', 'exams', p_exam,
          v_status || jsonb_build_object('allow_incomplete', p_allow_incomplete));
  return public.exam_result_status(p_exam);
end $$;

create or replace function public.unpublish_exam_results(p_exam uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'campusdesk:not_allowed' using errcode = '42501'; end if;
  update public.results set published = false where exam_id = p_exam;
  insert into public.audit_logs (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'unpublish_results', 'exams', p_exam, '{}'::jsonb);
end $$;

create or replace function public.class_exam_averages(p_class uuid)
returns table (exam_id uuid, exam_name text, exam_date date, subject_name text, avg_pct numeric, students int)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.start_date, s.name,
         round(avg(m.marks_obtained * 100.0 / m.max_marks), 1),
         count(distinct m.student_id)::int
  from public.marks m
  join public.exams e    on e.id = m.exam_id
  join public.subjects s on s.id = m.subject_id
  join public.results r  on r.student_id = m.student_id and r.exam_id = m.exam_id and r.published
  where e.class_id = p_class
    and (public.is_admin() or public.in_class(p_class))
  group by e.id, e.name, e.start_date, s.name
  having count(distinct m.student_id) >= 2;     -- never an "average" of one identifiable student
$$;
grant execute on function public.class_exam_averages(uuid) to authenticated;
