-- =====================================================================
-- 006_v2_leave_attendance_timetable.sql   SAFE FOR EXISTING V1 DATABASES
-- * Leave: date sanity + no overlapping pending/approved requests; decided_at stamped.
-- * Attendance: atomic save_attendance() for the teacher roster; aggregate summary RPC
--   (so dashboards never download thousands of rows).
-- * Timetable: conflict detection (same class or same teacher, overlapping period, same day).
-- Triggers only validate NEW writes; existing V1 rows are not touched.
-- =====================================================================

-- @@FUNCTIONS
create or replace function public.leave_requests_guard()
returns trigger language plpgsql as $$
begin
  if new.to_date < new.from_date then raise exception 'campusdesk:invalid_dates' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' then
    if new.from_date < current_date - 30 then raise exception 'campusdesk:leave_too_old' using errcode = 'P0001'; end if;
    if exists (select 1 from public.leave_requests l
               where l.requester_id = new.requester_id and l.status in ('pending','approved')
                 and l.from_date <= new.to_date and l.to_date >= new.from_date) then
      raise exception 'campusdesk:leave_overlap' using errcode = 'P0001';
    end if;
  elsif new.status is distinct from old.status and new.status in ('approved','rejected') then
    new.decided_at := now();
  end if;
  return new;
end $$;

create or replace function public.timetable_conflict_guard()
returns trigger language plpgsql as $$
begin
  if new.end_time <= new.start_time then raise exception 'campusdesk:invalid_times' using errcode = 'P0001'; end if;
  if exists (select 1 from public.timetable t
             where t.id is distinct from new.id and t.day_of_week = new.day_of_week
               and t.start_time < new.end_time and t.end_time > new.start_time
               and t.class_id = new.class_id) then
    raise exception 'campusdesk:class_conflict' using errcode = 'P0001';
  end if;
  if new.teacher_id is not null and exists (select 1 from public.timetable t
             where t.id is distinct from new.id and t.day_of_week = new.day_of_week
               and t.start_time < new.end_time and t.end_time > new.start_time
               and t.teacher_id = new.teacher_id) then
    raise exception 'campusdesk:teacher_conflict' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Save a whole roster atomically. p_rows = [{"student_id": "...", "status": "present|late|absent|leave"}]
create or replace function public.save_attendance(p_class uuid, p_subject uuid, p_date date, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_updated int := 0; v_inserted int := 0; n int;
begin
  if not (public.is_admin() or exists (select 1 from public.teacher_subjects ts
          where ts.teacher_id = auth.uid() and ts.class_id = p_class and ts.subject_id = p_subject)) then
    raise exception 'campusdesk:not_allowed' using errcode = '42501';
  end if;
  if p_date > current_date then raise exception 'campusdesk:future_date' using errcode = 'P0001'; end if;
  for r in select (x->>'student_id')::uuid as sid, x->>'status' as st from jsonb_array_elements(p_rows) x loop
    if r.st not in ('present','late','absent','leave') then raise exception 'campusdesk:invalid_status' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.students where id = r.sid and class_id = p_class) then
      raise exception 'campusdesk:student_not_in_class' using errcode = 'P0001';
    end if;
    update public.attendance set status = r.st, marked_by = auth.uid(), class_id = p_class
     where student_id = r.sid and subject_id = p_subject and date = p_date;
    get diagnostics n = row_count;
    if n = 0 then
      insert into public.attendance (student_id, class_id, subject_id, date, status, marked_by)
      values (r.sid, p_class, p_subject, p_date, r.st, auth.uid());
      v_inserted := v_inserted + 1;
    else v_updated := v_updated + n; end if;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end $$;

-- Aggregated counts (admin: any class; teacher: only classes they teach).
create or replace function public.attendance_summary_by_class(p_class uuid default null)
returns table (class_id uuid, subject_id uuid, present bigint, late bigint, absent bigint, leave_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.get_my_role() = 'teacher') then
    raise exception 'campusdesk:not_allowed' using errcode = '42501';
  end if;
  return query
  select a.class_id, a.subject_id,
         count(*) filter (where a.status = 'present'), count(*) filter (where a.status = 'late'),
         count(*) filter (where a.status = 'absent'),  count(*) filter (where a.status = 'leave')
  from public.attendance a
  where (p_class is null or a.class_id = p_class)
    and (public.is_admin()
         or exists (select 1 from public.teacher_subjects ts where ts.teacher_id = auth.uid() and ts.class_id = a.class_id)
         or exists (select 1 from public.classes c where c.id = a.class_id and c.class_teacher_id = auth.uid()))
  group by a.class_id, a.subject_id;
end $$;

-- @@TRIGGERS
drop trigger if exists leave_requests_guard on public.leave_requests;
create trigger leave_requests_guard before insert or update on public.leave_requests
  for each row execute procedure public.leave_requests_guard();
drop trigger if exists timetable_conflict_guard on public.timetable;
create trigger timetable_conflict_guard before insert or update on public.timetable
  for each row execute procedure public.timetable_conflict_guard();
