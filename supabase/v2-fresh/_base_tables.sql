-- Base tables for a FRESH V2 database (V1-compatible shape). Source for scripts/build-fresh.py
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. PROFILES (one row per auth user)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'student' check (role in ('admin','teacher','student','parent')),
  full_name   text,
  email       text,
  phone       text,
  avatar_url  text,
  status      text not null default 'active' check (status in ('active','suspended')),
  created_at  timestamptz not null default now()
);



-- ---------------------------------------------------------------------
-- 2. ACADEMIC STRUCTURE
-- ---------------------------------------------------------------------
create table if not exists public.classes (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,            -- "10"
  section          text not null,            -- "A"
  academic_year    text not null,
  class_teacher_id uuid,                     -- FK added below
  created_at       timestamptz not null default now(),
  unique (name, section, academic_year)
);

create table if not exists public.teachers (
  id             uuid primary key references public.profiles(id) on delete cascade,
  employee_id    text unique,
  department     text,
  qualification  text,
  joining_date   date
);

alter table public.classes
  drop constraint if exists classes_class_teacher_fk;
alter table public.classes
  add constraint classes_class_teacher_fk
  foreign key (class_teacher_id) references public.teachers(id) on delete set null;

create table if not exists public.subjects (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  code      text,
  class_id  uuid references public.classes(id) on delete cascade
);

create table if not exists public.teacher_subjects (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers(id) on delete cascade,
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  unique (teacher_id, subject_id, class_id)
);

-- ---------------------------------------------------------------------
-- 3. STUDENTS (parent_id links a student to a parent profile)
-- ---------------------------------------------------------------------
create table if not exists public.students (
  id              uuid primary key references public.profiles(id) on delete cascade,
  roll_no         text unique,
  class_id        uuid references public.classes(id) on delete set null,
  dob             date,
  gender          text,
  address         text,
  admission_date  date default current_date,
  parent_id       uuid references public.profiles(id) on delete set null
);

-- ---------------------------------------------------------------------
-- 4. ATTENDANCE (one row per student, subject/period and date)
-- ---------------------------------------------------------------------
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  class_id    uuid references public.classes(id) on delete cascade,
  subject_id  uuid references public.subjects(id) on delete cascade,
  date        date not null default current_date,
  status      text not null check (status in ('present','absent','late','leave')),
  marked_by   uuid references public.teachers(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (student_id, subject_id, date)
);

-- ---------------------------------------------------------------------
-- 5. EXAMS / MARKS / RESULTS
-- ---------------------------------------------------------------------
create table if not exists public.exams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  class_id    uuid references public.classes(id) on delete cascade,
  term        text,
  start_date  date,
  end_date    date
);

create table if not exists public.marks (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id) on delete cascade,
  exam_id         uuid not null references public.exams(id) on delete cascade,
  subject_id      uuid not null references public.subjects(id) on delete cascade,
  marks_obtained  numeric not null check (marks_obtained >= 0),
  max_marks       numeric not null default 100 check (max_marks > 0),
  entered_by      uuid references public.teachers(id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (student_id, exam_id, subject_id),
  check (marks_obtained <= max_marks)
);

create table if not exists public.results (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  exam_id      uuid not null references public.exams(id) on delete cascade,
  total_marks  numeric,
  percentage   numeric,
  grade        text,
  rank         int,
  published    boolean not null default false,
  unique (student_id, exam_id)
);

-- ---------------------------------------------------------------------
-- 6. FEES (manual tracking, no payment gateway)
--    Payment states actually used by the app:
--      paid                 admin confirmed full payment
--      partial              admin confirmed part payment
--      due                  nothing paid yet
--      pending_verification student/parent submitted, admin has not verified
--      rejected             admin rejected a submitted payment
-- ---------------------------------------------------------------------
create table if not exists public.fee_structure (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid references public.classes(id) on delete cascade,
  academic_year  text,
  fee_type       text not null,
  amount         numeric not null check (amount >= 0),
  due_date       date
);

create table if not exists public.fee_payments (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students(id) on delete cascade,
  fee_structure_id  uuid references public.fee_structure(id) on delete cascade,
  amount_paid       numeric not null default 0 check (amount_paid >= 0),
  payment_date      date,
  mode              text,                       -- cash / cheque / UPI / bank transfer
  status            text not null default 'due'
                    check (status in ('paid','partial','due','pending_verification','rejected')),
  receipt_no        text,
  recorded_by       uuid references public.profiles(id) on delete set null
);

-- ---------------------------------------------------------------------
-- 7. NOTICES / EVENTS / TIMETABLE
-- ---------------------------------------------------------------------
create table if not exists public.notices (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  content          text,
  target_role      text not null default 'all' check (target_role in ('all','students','teachers','parents')),
  target_class_id  uuid references public.classes(id) on delete cascade,
  posted_by        uuid references public.profiles(id) on delete set null,
  pinned           boolean not null default false,
  expiry_date      date,
  created_at       timestamptz not null default now()
);

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  event_date   date not null,
  start_time   time,
  event_type   text not null default 'other'
               check (event_type in ('exam','meeting','activity','deadline','holiday','other')),
  location     text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- day_of_week: 0 = Sunday ... 6 = Saturday (JavaScript Date.getDay() convention)
create table if not exists public.timetable (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes(id) on delete cascade,
  subject_id   uuid references public.subjects(id) on delete cascade,
  teacher_id   uuid references public.teachers(id) on delete set null,
  day_of_week  int not null check (day_of_week between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  room         text,
  check (end_time > start_time),
  unique (class_id, day_of_week, start_time)
);

-- ---------------------------------------------------------------------
-- 8. LEAVE / AUDIT / TEACHER QUERIES / NOTIFICATIONS
-- ---------------------------------------------------------------------
create table if not exists public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  requester_id    uuid not null references public.profiles(id) on delete cascade,
  requester_role  text check (requester_role in ('student','teacher','parent','admin')),
  from_date       date not null,
  to_date         date not null,
  reason          text,
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  check (to_date >= from_date)
);

create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references public.profiles(id) on delete set null,
  action        text not null,
  target_table  text,
  target_id     uuid,
  details       jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists public.teacher_queries (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid references public.students(id) on delete cascade,
  sender_id    uuid references public.profiles(id) on delete cascade,
  sender_role  text,
  teacher_id   uuid references public.teachers(id) on delete cascade,
  query_type   text,
  message      text not null,
  reply        text,
  status       text not null default 'open' check (status in ('open','answered')),
  created_at   timestamptz not null default now(),
  replied_at   timestamptz
);



-- ---------------------------------------------------------------------
-- 9. INDEXES
-- ---------------------------------------------------------------------
create index if not exists idx_students_class        on public.students(class_id);
create index if not exists idx_students_parent       on public.students(parent_id);
create index if not exists idx_attendance_student    on public.attendance(student_id, date desc);
create index if not exists idx_attendance_class_date on public.attendance(class_id, subject_id, date);
create index if not exists idx_marks_student_exam    on public.marks(student_id, exam_id);
create index if not exists idx_marks_subject         on public.marks(subject_id);
create index if not exists idx_results_student       on public.results(student_id);
create index if not exists idx_fee_payments_student  on public.fee_payments(student_id);
create index if not exists idx_fee_structure_class   on public.fee_structure(class_id);
create index if not exists idx_timetable_class_day   on public.timetable(class_id, day_of_week, start_time);
create index if not exists idx_timetable_teacher     on public.timetable(teacher_id, day_of_week, start_time);
create index if not exists idx_notices_created       on public.notices(created_at desc);
create index if not exists idx_events_date           on public.events(event_date);
create index if not exists idx_leave_requester       on public.leave_requests(requester_id, created_at desc);
create index if not exists idx_audit_created         on public.audit_logs(created_at desc);
create index if not exists idx_teacher_subjects_t    on public.teacher_subjects(teacher_id, class_id);
create index if not exists idx_queries_teacher       on public.teacher_queries(teacher_id, status);

