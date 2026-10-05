-- =====================================================================
-- 007_v2_indexes.sql                 SAFE FOR EXISTING V1 DATABASES
-- Performance indexes only (create index if not exists). No data changes.
-- On very large tables run during a quiet period.
-- =====================================================================

-- @@SCHEMA
create index if not exists idx_students_class        on public.students(class_id);
create index if not exists idx_students_parent       on public.students(parent_id);
create index if not exists idx_attendance_student    on public.attendance(student_id, date desc);
create index if not exists idx_attendance_class_subj on public.attendance(class_id, subject_id, date);
create index if not exists idx_marks_student_exam    on public.marks(student_id, exam_id);
create index if not exists idx_marks_subject         on public.marks(subject_id);
create index if not exists idx_results_student       on public.results(student_id);
create index if not exists idx_fee_structure_class   on public.fee_structure(class_id);
create index if not exists idx_timetable_class_day   on public.timetable(class_id, day_of_week, start_time);
create index if not exists idx_timetable_teacher_day on public.timetable(teacher_id, day_of_week, start_time);
create index if not exists idx_notices_created       on public.notices(created_at desc);
create index if not exists idx_events_date           on public.events(event_date);
create index if not exists idx_leave_requester       on public.leave_requests(requester_id, created_at desc);
create index if not exists idx_audit_created         on public.audit_logs(created_at desc);
create index if not exists idx_teacher_subjects_t    on public.teacher_subjects(teacher_id, class_id);
create index if not exists idx_queries_teacher       on public.teacher_queries(teacher_id, status);
