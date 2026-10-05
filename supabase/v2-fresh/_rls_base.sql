-- =====================================================================
-- CampusDesk V2 - 02_rls_policies.sql
-- Row Level Security for every table. RLS is never disabled.
-- Run AFTER 01_schema.sql. Re-runnable (drops each policy first).
-- Roles: admin | teacher | student | parent  (see profiles.role)
-- =====================================================================

-- Enable RLS everywhere
alter table public.profiles         enable row level security;
alter table public.classes          enable row level security;
alter table public.teachers         enable row level security;
alter table public.subjects         enable row level security;
alter table public.teacher_subjects enable row level security;
alter table public.students         enable row level security;
alter table public.attendance       enable row level security;
alter table public.exams            enable row level security;
alter table public.marks            enable row level security;
alter table public.results          enable row level security;
alter table public.fee_structure    enable row level security;
alter table public.fee_payments     enable row level security;
alter table public.notices          enable row level security;
alter table public.events           enable row level security;
alter table public.timetable        enable row level security;
alter table public.leave_requests   enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.teacher_queries  enable row level security;

-- Drop any previous policy so this file can be re-run (also removes V1 leftovers)
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','classes','teachers','subjects','teacher_subjects','students',
                        'attendance','exams','marks','results','fee_structure','fee_payments',
                        'notices','events','timetable','leave_requests','audit_logs',
                        'teacher_queries')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- profiles: see yourself, staff, your family link, and (teachers) your classes
-- ---------------------------------------------------------------------
create policy "profiles: visible via can_view_profile" on public.profiles
  for select using (public.can_view_profile(id));
create policy "profiles: admin manages" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());
create policy "profiles: user updates own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());   -- role/status guarded by trigger

-- ---------------------------------------------------------------------
-- Reference data: readable by any signed-in user, written by admin
-- ---------------------------------------------------------------------
create policy "classes: read" on public.classes for select using (auth.uid() is not null);
create policy "classes: admin" on public.classes for all using (public.is_admin()) with check (public.is_admin());

create policy "subjects: read" on public.subjects for select using (auth.uid() is not null);
create policy "subjects: admin" on public.subjects for all using (public.is_admin()) with check (public.is_admin());

create policy "teacher_subjects: read" on public.teacher_subjects for select using (auth.uid() is not null);
create policy "teacher_subjects: admin" on public.teacher_subjects for all using (public.is_admin()) with check (public.is_admin());

create policy "teachers: read directory" on public.teachers for select using (auth.uid() is not null);
create policy "teachers: admin" on public.teachers for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------
create policy "students: admin" on public.students for all using (public.is_admin()) with check (public.is_admin());
create policy "students: own row" on public.students for select using (id = auth.uid());
create policy "students: parent reads child" on public.students for select using (parent_id = auth.uid());
create policy "students: teacher reads own classes" on public.students for select using (public.teaches_student(id));

-- ---------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------
create policy "attendance: admin" on public.attendance for all using (public.is_admin()) with check (public.is_admin());
create policy "attendance: student reads own" on public.attendance for select using (student_id = auth.uid());
create policy "attendance: parent reads child" on public.attendance for select using (public.is_parent_of(student_id));
create policy "attendance: teacher reads own classes" on public.attendance for select using (
  exists (select 1 from public.teacher_subjects ts where ts.teacher_id = auth.uid() and ts.class_id = attendance.class_id)
  or exists (select 1 from public.classes c where c.id = attendance.class_id and c.class_teacher_id = auth.uid())
);
create policy "attendance: teacher inserts own subject" on public.attendance for insert with check (
  exists (select 1 from public.teacher_subjects ts
          where ts.teacher_id = auth.uid() and ts.class_id = attendance.class_id and ts.subject_id = attendance.subject_id)
);
create policy "attendance: teacher updates own subject" on public.attendance for update
  using (exists (select 1 from public.teacher_subjects ts
          where ts.teacher_id = auth.uid() and ts.class_id = attendance.class_id and ts.subject_id = attendance.subject_id))
  with check (exists (select 1 from public.teacher_subjects ts
          where ts.teacher_id = auth.uid() and ts.class_id = attendance.class_id and ts.subject_id = attendance.subject_id));

-- ---------------------------------------------------------------------
-- exams / marks / results
-- ---------------------------------------------------------------------
create policy "exams: admin" on public.exams for all using (public.is_admin()) with check (public.is_admin());
create policy "exams: read for connected users" on public.exams for select using (public.in_class(class_id));

create policy "marks: admin" on public.marks for all using (public.is_admin()) with check (public.is_admin());
create policy "marks: teacher reads own subject" on public.marks for select using (
  exists (select 1 from public.teacher_subjects ts where ts.teacher_id = auth.uid() and ts.subject_id = marks.subject_id)
);
create policy "marks: teacher inserts own subject" on public.marks for insert with check (
  exists (select 1 from public.teacher_subjects ts where ts.teacher_id = auth.uid() and ts.subject_id = marks.subject_id)
);
create policy "marks: teacher updates own subject" on public.marks for update
  using (exists (select 1 from public.teacher_subjects ts where ts.teacher_id = auth.uid() and ts.subject_id = marks.subject_id))
  with check (exists (select 1 from public.teacher_subjects ts where ts.teacher_id = auth.uid() and ts.subject_id = marks.subject_id));
-- Students and parents only see marks once the exam result is published.
create policy "marks: student reads own published" on public.marks for select using (
  student_id = auth.uid()
  and exists (select 1 from public.results r where r.student_id = marks.student_id and r.exam_id = marks.exam_id and r.published)
);
create policy "marks: parent reads child published" on public.marks for select using (
  public.is_parent_of(student_id)
  and exists (select 1 from public.results r where r.student_id = marks.student_id and r.exam_id = marks.exam_id and r.published)
);

create policy "results: admin" on public.results for all using (public.is_admin()) with check (public.is_admin());
create policy "results: student reads own published" on public.results for select using (student_id = auth.uid() and published);
create policy "results: parent reads child published" on public.results for select using (published and public.is_parent_of(student_id));
create policy "results: teacher reads own students published" on public.results for select using (published and public.teaches_student(student_id));

-- ---------------------------------------------------------------------
-- fees
-- ---------------------------------------------------------------------
create policy "fee_structure: admin" on public.fee_structure for all using (public.is_admin()) with check (public.is_admin());
create policy "fee_structure: student/parent read own class" on public.fee_structure for select using (
  public.get_my_role() in ('student','parent') and public.in_class(class_id)
);

create policy "fee_payments: admin" on public.fee_payments for all using (public.is_admin()) with check (public.is_admin());
create policy "fee_payments: student reads own" on public.fee_payments for select using (student_id = auth.uid());
create policy "fee_payments: parent reads child" on public.fee_payments for select using (public.is_parent_of(student_id));
-- Students/parents cannot INSERT fee_payments directly in a fresh V2 database: they must call
-- submit_fee_payment() (SECURITY DEFINER). The fee_payments_guard trigger still protects every write path.

-- ---------------------------------------------------------------------
-- notices / events
-- ---------------------------------------------------------------------
create policy "notices: admin" on public.notices for all using (public.is_admin()) with check (public.is_admin());
create policy "notices: author reads own" on public.notices for select using (posted_by = auth.uid());
create policy "notices: author deletes own" on public.notices for delete using (posted_by = auth.uid());
create policy "notices: teacher posts for own classes" on public.notices for insert with check (
  public.get_my_role() = 'teacher'
  and posted_by = auth.uid()
  and (target_class_id is null or exists (
        select 1 from public.teacher_subjects ts where ts.teacher_id = auth.uid() and ts.class_id = notices.target_class_id))
);
-- Everyone else sees only notices addressed to their role and (if class-targeted) their class.
create policy "notices: read targeted" on public.notices for select using (
  (expiry_date is null or expiry_date >= current_date)
  and (target_role = 'all' or target_role = public.get_my_role() || 's')
  and (target_class_id is null or public.in_class(target_class_id))
);

create policy "events: read" on public.events for select using (auth.uid() is not null);
create policy "events: admin" on public.events for all using (public.is_admin()) with check (public.is_admin());
create policy "events: teacher creates" on public.events for insert
  with check (public.get_my_role() = 'teacher' and created_by = auth.uid());
create policy "events: creator deletes own" on public.events for delete using (created_by = auth.uid());

-- ---------------------------------------------------------------------
-- timetable
-- ---------------------------------------------------------------------
create policy "timetable: admin" on public.timetable for all using (public.is_admin()) with check (public.is_admin());
create policy "timetable: read own class or own teaching" on public.timetable for select using (
  teacher_id = auth.uid() or public.in_class(class_id)
);
create policy "timetable: teacher manages own entries" on public.timetable for all
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.teacher_subjects ts
                where ts.teacher_id = auth.uid() and ts.class_id = timetable.class_id and ts.subject_id = timetable.subject_id)
  );

-- ---------------------------------------------------------------------
-- leave requests
-- ---------------------------------------------------------------------
create policy "leave: admin" on public.leave_requests for all using (public.is_admin()) with check (public.is_admin());
create policy "leave: user creates own" on public.leave_requests for insert
  with check (requester_id = auth.uid() and requester_role = public.get_my_role() and status = 'pending');
create policy "leave: user reads own" on public.leave_requests for select using (requester_id = auth.uid());
create policy "leave: teacher reads own students" on public.leave_requests for select using (
  public.get_my_role() = 'teacher' and requester_role = 'student' and public.teaches_student(requester_id)
);
create policy "leave: teacher decides own students" on public.leave_requests for update
  using (public.get_my_role() = 'teacher' and requester_role = 'student' and public.teaches_student(requester_id))
  with check (requester_role = 'student' and status in ('approved','rejected') and approved_by = auth.uid());

-- ---------------------------------------------------------------------
-- audit logs
-- ---------------------------------------------------------------------
create policy "audit: admin reads" on public.audit_logs for select using (public.is_admin());
create policy "audit: user writes own actions" on public.audit_logs for insert with check (actor_id = auth.uid());

-- ---------------------------------------------------------------------
-- teacher queries (student/parent <-> teacher chat)
-- ---------------------------------------------------------------------
create policy "queries: admin" on public.teacher_queries for all using (public.is_admin()) with check (public.is_admin());
create policy "queries: sender inserts" on public.teacher_queries for insert with check (
  sender_id = auth.uid() and (student_id = auth.uid() or public.is_parent_of(student_id))
);
create policy "queries: sender reads own" on public.teacher_queries for select using (sender_id = auth.uid());
create policy "queries: teacher reads addressed" on public.teacher_queries for select using (teacher_id = auth.uid());
create policy "queries: teacher replies" on public.teacher_queries for update
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

