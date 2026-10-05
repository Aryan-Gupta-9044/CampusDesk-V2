-- =====================================================================
-- 005_v2_notifications.sql           SAFE FOR EXISTING V1 DATABASES
-- Notification + audit triggers (SECURITY DEFINER; users cannot forge notifications).
-- Seed scripts set `campusdesk.seeding = on` to keep these quiet while loading demo data.
-- =====================================================================

-- @@FUNCTIONS
create or replace function public.is_seeding()
returns boolean language sql stable as $$
  select coalesce(current_setting('campusdesk.seeding', true), '') = 'on';
$$;

create or replace function public.push_notification(p_user uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, link)
  select p_user, p_type, p_title, p_body, p_link
  where p_user is not null and exists (select 1 from public.profiles where id = p_user and status = 'active');
$$;

create or replace function public.notify_student_and_parent(p_student uuid, p_type text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare v_parent uuid;
begin
  select parent_id into v_parent from public.students where id = p_student;
  perform public.push_notification(p_student, p_type, p_title, p_body, p_link);
  perform public.push_notification(v_parent,  p_type, p_title, p_body, p_link);
end $$;

create or replace function public.trg_notice_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_seeding() then return new; end if;
  insert into public.notifications (user_id, type, title, body, link)
  select p.id, 'notice', 'New notice: ' || new.title, left(coalesce(new.content, ''), 140), '/notices'
  from public.profiles p
  where p.status = 'active' and p.id is distinct from new.posted_by
    and (new.target_role = 'all' or new.target_role = p.role || 's')
    and (new.target_class_id is null
         or exists (select 1 from public.students s where s.class_id = new.target_class_id and (s.id = p.id or s.parent_id = p.id))
         or exists (select 1 from public.teacher_subjects ts where ts.class_id = new.target_class_id and ts.teacher_id = p.id)
         or p.role = 'admin');
  insert into public.audit_logs (actor_id, action, target_table, target_id, details)
  values (new.posted_by, 'post_notice', 'notices', new.id, jsonb_build_object('title', new.title));
  return new;
end $$;

create or replace function public.trg_result_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_exam text;
begin
  if public.is_seeding() then return new; end if;
  if new.published and (tg_op = 'INSERT' or coalesce(old.published, false) = false) then
    select name into v_exam from public.exams where id = new.exam_id;
    perform public.notify_student_and_parent(new.student_id, 'result', 'Result published: ' || coalesce(v_exam, 'exam'),
      'Your result is now available.', '/results');
  end if;
  return new;
end $$;

create or replace function public.trg_fee_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if public.is_seeding() then return new; end if;
  select full_name into v_name from public.profiles where id = new.student_id;
  if tg_op = 'INSERT' and new.status = 'pending_verification' then
    insert into public.notifications (user_id, type, title, body, link)
    select p.id, 'fee', 'Payment awaiting verification',
           coalesce(v_name, 'A student') || ' submitted INR ' || new.amount_paid::text, '/fees'
    from public.profiles p where p.role = 'admin' and p.status = 'active';
    perform public.push_notification(new.student_id, 'fee', 'Payment submitted',
            'INR ' || new.amount_paid::text || ' is awaiting verification by the school office.', '/fees');
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status in ('paid','partial') then
      perform public.notify_student_and_parent(new.student_id, 'fee', 'Payment verified',
        'INR ' || new.amount_paid::text || ' was confirmed. Receipt ' || coalesce(new.receipt_no, '-') || '.', '/fees');
    elsif new.status = 'rejected' then
      perform public.notify_student_and_parent(new.student_id, 'fee', 'Payment rejected',
        coalesce(nullif(new.rejection_reason, ''), 'A submitted payment could not be verified.') || ' You can submit it again.', '/fees');
    end if;
  end if;
  return new;
end $$;

create or replace function public.trg_leave_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if public.is_seeding() then return new; end if;
  if tg_op = 'INSERT' then
    select full_name into v_name from public.profiles where id = new.requester_id;
    insert into public.notifications (user_id, type, title, body, link)
    select p.id, 'leave', 'New leave request',
           coalesce(v_name, 'A user') || ' requested leave from ' || new.from_date::text || ' to ' || new.to_date::text, '/leave'
    from public.profiles p where p.role = 'admin' and p.status = 'active';
    insert into public.audit_logs (actor_id, action, target_table, target_id, details)
    values (new.requester_id, 'request_leave', 'leave_requests', new.id, jsonb_build_object('requester', v_name));
  elsif new.status is distinct from old.status and new.status in ('approved','rejected') then
    perform public.push_notification(new.requester_id, 'leave', 'Leave request ' || new.status,
      'Your leave from ' || new.from_date::text || ' to ' || new.to_date::text || ' was ' || new.status ||
      case when new.status = 'rejected' and new.rejection_reason is not null then ': ' || new.rejection_reason else '.' end, '/leave');
  end if;
  return new;
end $$;

create or replace function public.trg_timetable_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.timetable; v_subject text; v_verb text;
begin
  if public.is_seeding() then return coalesce(new, old); end if;
  r := case when tg_op = 'DELETE' then old else new end;
  v_verb := case tg_op when 'INSERT' then 'added to' when 'UPDATE' then 'changed in' else 'removed from' end;
  select name into v_subject from public.subjects where id = r.subject_id;
  insert into public.notifications (user_id, type, title, body, link)
  select distinct u.uid, 'timetable', 'Timetable updated', coalesce(v_subject, 'A period') || ' was ' || v_verb || ' the timetable.', '/timetable'
  from (select s.id as uid from public.students s where s.class_id = r.class_id
        union select s.parent_id from public.students s where s.class_id = r.class_id and s.parent_id is not null
        union select r.teacher_id where r.teacher_id is not null) u
  where u.uid is distinct from auth.uid()
    and exists (select 1 from public.profiles pr where pr.id = u.uid and pr.status = 'active');
  insert into public.audit_logs (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'timetable_' || lower(tg_op), 'timetable', r.id, jsonb_build_object('subject', v_subject));
  return coalesce(new, old);
end $$;

create or replace function public.trg_event_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_seeding() then return new; end if;
  insert into public.notifications (user_id, type, title, body, link)
  select p.id, 'event', 'New event: ' || new.title, to_char(new.event_date, 'DD Mon YYYY'), '/events'
  from public.profiles p where p.status = 'active' and p.id is distinct from new.created_by;
  return new;
end $$;

create or replace function public.trg_query_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_seeding() then return new; end if;
  if tg_op = 'INSERT' then
    perform public.push_notification(new.teacher_id, 'query', 'New student query', left(new.message, 120), '/chat');
  elsif new.status = 'answered' and old.status is distinct from 'answered' then
    perform public.push_notification(new.sender_id, 'query', 'Your query was answered', left(coalesce(new.reply, ''), 120), '/chat');
  end if;
  return new;
end $$;

-- Attendance alert: tell student + parent when a student is marked absent.
create or replace function public.trg_attendance_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_subject text;
begin
  if public.is_seeding() then return new; end if;
  if new.status = 'absent' and (tg_op = 'INSERT' or old.status is distinct from 'absent') then
    select name into v_subject from public.subjects where id = new.subject_id;
    perform public.notify_student_and_parent(new.student_id, 'attendance', 'Marked absent',
      'Absent in ' || coalesce(v_subject, 'class') || ' on ' || to_char(new.date, 'DD Mon YYYY') || '.', '/attendance');
  end if;
  return new;
end $$;

-- @@TRIGGERS
drop trigger if exists notices_notify on public.notices;
create trigger notices_notify after insert on public.notices for each row execute procedure public.trg_notice_notify();
drop trigger if exists results_notify on public.results;
create trigger results_notify after insert or update of published on public.results for each row execute procedure public.trg_result_notify();
drop trigger if exists fee_payments_notify on public.fee_payments;
create trigger fee_payments_notify after insert or update of status on public.fee_payments for each row execute procedure public.trg_fee_notify();
drop trigger if exists leave_notify on public.leave_requests;
create trigger leave_notify after insert or update of status on public.leave_requests for each row execute procedure public.trg_leave_notify();
drop trigger if exists timetable_notify on public.timetable;
create trigger timetable_notify after insert or update or delete on public.timetable for each row execute procedure public.trg_timetable_notify();
drop trigger if exists events_notify on public.events;
create trigger events_notify after insert on public.events for each row execute procedure public.trg_event_notify();
drop trigger if exists queries_notify on public.teacher_queries;
create trigger queries_notify after insert or update of status on public.teacher_queries for each row execute procedure public.trg_query_notify();
drop trigger if exists attendance_notify on public.attendance;
create trigger attendance_notify after insert or update of status on public.attendance for each row execute procedure public.trg_attendance_notify();

-- @@SCHEMA
-- Realtime for the bell icon (optional; no-op when the publication does not exist)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
