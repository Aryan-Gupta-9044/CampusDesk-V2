-- =====================================================================
-- FRESH V2 DATABASE ONLY - DEMO DATA - DO NOT RUN ON AN EXISTING CAMPUSDESK V1 DATABASE
--
-- v2-fresh/seed.sql  - realistic demo data for academic year 2026-27.
-- It is INSERT-ONLY. It contains no DELETE / DROP / TRUNCATE.
-- Safety guard: it aborts if the database already holds any account that is not a
-- demo account (*@campusdesk.com), and aborts if the demo data was already loaded.
-- (To reload from scratch use v2-fresh/reset_demo_data.sql, also fresh-only.)
--
-- Contents: 4 classes, 6 teachers, 12 students, 5 parents, 1 admin, 120 timetable periods,
-- 4 weeks of attendance, 3 published exams + 1 upcoming (one subject deliberately incomplete),
-- fees in every state (paid / partial / due / pending_verification / rejected),
-- notices, events, leave in every status, teacher queries, notifications, audit log.
-- Dates are relative to the day you run it.
--
-- DEMO LOGINS (NOT production credentials):
--   admin@campusdesk.com                  Admin@123
--   teacher1..teacher6@campusdesk.com     Teacher@123
--   student1..student12@campusdesk.com    Student@123
--   parent1..parent5@campusdesk.com       Parent@123
-- =====================================================================

begin;

do $$
begin
  if exists (select 1 from auth.users where email not like '%@campusdesk.com') then
    raise exception 'ABORTED: this database contains real (non-demo) accounts. seed.sql is for a FRESH V2 database only.';
  end if;
  if exists (select 1 from auth.users where email like '%@campusdesk.com') then
    raise exception 'ABORTED: demo data is already loaded. Use v2-fresh/reset_demo_data.sql first (fresh DBs only).';
  end if;
end $$;

-- Keep notification / audit triggers quiet while seeding
select set_config('campusdesk.seeding', 'on', true);

-- ---------------------------------------------------------------------
-- 1. Demo people (Auth users). Passwords are bcrypt-hashed by pgcrypto.
-- ---------------------------------------------------------------------
create temporary table demo_users (
  email text primary key, id uuid default gen_random_uuid(), full_name text,
  role text, pw text, phone text, seq int
) on commit drop;

insert into demo_users (email, full_name, role, pw, phone, seq) values
  ('admin@campusdesk.com',     'Kavita Menon',     'admin',   'Admin@123',   '+91 98400 10001', 0),
  ('teacher1@campusdesk.com',  'Anita Sharma',     'teacher', 'Teacher@123', '+91 98400 20001', 1),
  ('teacher2@campusdesk.com',  'Ravi Verma',       'teacher', 'Teacher@123', '+91 98400 20002', 2),
  ('teacher3@campusdesk.com',  'Priya Nair',       'teacher', 'Teacher@123', '+91 98400 20003', 3),
  ('teacher4@campusdesk.com',  'Suresh Iyer',      'teacher', 'Teacher@123', '+91 98400 20004', 4),
  ('teacher5@campusdesk.com',  'Deepak Joshi',     'teacher', 'Teacher@123', '+91 98400 20005', 5),
  ('teacher6@campusdesk.com',  'Meera Kapoor',     'teacher', 'Teacher@123', '+91 98400 20006', 6),
  ('parent1@campusdesk.com',   'Rajesh Mehta',     'parent',  'Parent@123',  '+91 98400 30001', 1),
  ('parent2@campusdesk.com',   'Sunita Singh',     'parent',  'Parent@123',  '+91 98400 30002', 2),
  ('parent3@campusdesk.com',   'Neha Kapoor',      'parent',  'Parent@123',  '+91 98400 30003', 3),
  ('parent4@campusdesk.com',   'Venkat Reddy',     'parent',  'Parent@123',  '+91 98400 30004', 4),
  ('parent5@campusdesk.com',   'Anil Gupta',       'parent',  'Parent@123',  '+91 98400 30005', 5),
  ('student1@campusdesk.com',  'Aarav Mehta',      'student', 'Student@123', '+91 98400 40001', 1),
  ('student2@campusdesk.com',  'Diya Kapoor',      'student', 'Student@123', '+91 98400 40002', 2),
  ('student3@campusdesk.com',  'Kabir Singh',      'student', 'Student@123', '+91 98400 40003', 3),
  ('student4@campusdesk.com',  'Ananya Reddy',     'student', 'Student@123', '+91 98400 40004', 4),
  ('student5@campusdesk.com',  'Rohan Gupta',      'student', 'Student@123', '+91 98400 40005', 5),
  ('student6@campusdesk.com',  'Sneha Iyer',       'student', 'Student@123', '+91 98400 40006', 6),
  ('student7@campusdesk.com',  'Arjun Nair',       'student', 'Student@123', '+91 98400 40007', 7),
  ('student8@campusdesk.com',  'Ishita Singh',     'student', 'Student@123', '+91 98400 40008', 8),
  ('student9@campusdesk.com',  'Vihaan Desai',     'student', 'Student@123', '+91 98400 40009', 9),
  ('student10@campusdesk.com', 'Meera Pillai',     'student', 'Student@123', '+91 98400 40010', 10),
  ('student11@campusdesk.com', 'Aditya Joshi',     'student', 'Student@123', '+91 98400 40011', 11),
  ('student12@campusdesk.com', 'Tanvi Bhatt',      'student', 'Student@123', '+91 98400 40012', 12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  crypt(pw, gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', full_name),
  now(), now(), now(), '', '', '', ''
from demo_users;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id::text, id,
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
from demo_users;

-- The on_auth_user_created trigger already inserted profiles (as 'student').
-- Set the real role / phone now. (Allowed: SQL editor has no auth.uid().)
update public.profiles p
set role = d.role, phone = d.phone, full_name = d.full_name
from demo_users d where d.id = p.id;

-- ---------------------------------------------------------------------
-- 2. Classes, teachers, subjects, teaching assignments
-- ---------------------------------------------------------------------
insert into public.teachers (id, employee_id, department, qualification, joining_date)
select d.id, 'EMP-' || lpad(d.seq::text, 3, '0'),
       (array['Mathematics','Science','English','Social Science','Computer Science','Chemistry'])[d.seq],
       (array['M.Sc. Mathematics, B.Ed','M.Sc. Physics, B.Ed','M.A. English, B.Ed','M.A. History, B.Ed','M.C.A., B.Ed','M.Sc. Chemistry, B.Ed'])[d.seq],
       current_date - (500 + d.seq * 90)
from demo_users d where d.role = 'teacher';

create temporary table demo_classes (name text, section text, id uuid default gen_random_uuid(), class_teacher int) on commit drop;
insert into demo_classes (name, section, class_teacher) values ('10','A',1),('10','B',3),('11','A',2),('11','B',6);

insert into public.classes (id, name, section, academic_year, class_teacher_id)
select c.id, c.name, c.section, '2026-27', t.id
from demo_classes c join demo_users t on t.role = 'teacher' and t.seq = c.class_teacher;

-- subject name -> code -> teacher seq, per class
create temporary table demo_subject_map (class_name text, subject text, code text, teacher_seq int) on commit drop;
insert into demo_subject_map values
  ('10','Mathematics','MATH',1),('10','Science','SCI',2),('10','English','ENG',3),('10','Social Science','SST',4),('10','Computer Science','CS',5),
  ('11','Mathematics','MATH',1),('11','Physics','PHY',2),('11','English','ENG',3),('11','Chemistry','CHEM',6),('11','Computer Science','CS',5);

create temporary table demo_subjects on commit drop as
  select gen_random_uuid() as id, c.id as class_id, m.subject, m.code, m.teacher_seq
  from demo_classes c join demo_subject_map m on m.class_name = c.name;

insert into public.subjects (id, class_id, name, code) select id, class_id, subject, code from demo_subjects;

insert into public.teacher_subjects (teacher_id, subject_id, class_id)
select t.id, s.id, s.class_id
from demo_subjects s join demo_users t on t.role = 'teacher' and t.seq = s.teacher_seq;

-- ---------------------------------------------------------------------
-- 3. Students and parent links
-- ---------------------------------------------------------------------
create temporary table demo_students (seq int, class_name text, section text, roll text, gender text, parent_seq int, dob date, base int) on commit drop;
insert into demo_students values
  (1, '10','A','10A01','Male',  1, date '2011-03-14', 86),
  (2, '10','A','10A02','Female',3, date '2011-07-02', 78),
  (3, '10','A','10A03','Male',  2, date '2011-11-21', 70),
  (4, '10','A','10A04','Female',4, date '2011-01-09', 91),
  (5, '10','B','10B01','Male',  5, date '2011-05-30', 82),
  (6, '10','B','10B02','Female',null, date '2011-09-17', 74),
  (7, '10','B','10B03','Male',  null, date '2011-12-05', 66),
  (8, '11','A','11A01','Female',2, date '2010-02-11', 88),
  (9, '11','A','11A02','Male',  null, date '2010-06-25', 79),
  (10,'11','A','11A03','Female',null, date '2010-10-08', 72),
  (11,'11','B','11B01','Male',  null, date '2010-04-19', 84),
  (12,'11','B','11B02','Female',null, date '2010-08-28', 68);

insert into public.students (id, roll_no, class_id, dob, gender, address, admission_date, parent_id)
select su.id, ds.roll, c.id, ds.dob, ds.gender,
       (10 + ds.seq * 3)::text || ', Lake View Road, Chennai, Tamil Nadu',
       date '2024-06-10',
       pu.id
from demo_students ds
join demo_users su on su.role = 'student' and su.seq = ds.seq
join demo_classes c on c.name = ds.class_name and c.section = ds.section
left join demo_users pu on pu.role = 'parent' and pu.seq = ds.parent_seq;

-- ---------------------------------------------------------------------
-- 4. Timetable (Mon-Fri, 6 periods; no teacher or room clashes)
--    day_of_week: 1 = Monday ... 5 = Friday.  11:00-12:00 is the break.
-- ---------------------------------------------------------------------
create temporary table demo_tt (class_name text, section text, subject text, dow int, st time, et time, room text) on commit drop;
insert into demo_tt values
  ('10','A','Mathematics',1,'08:00','09:00','LH101'),
  ('10','B','Science',1,'08:00','09:00','Lab 1'),
  ('11','A','English',1,'08:00','09:00','Room 204'),
  ('11','B','Chemistry',1,'08:00','09:00','Lab 2'),
  ('10','A','Science',1,'09:00','10:00','Lab 1'),
  ('10','B','Mathematics',1,'09:00','10:00','LH102'),
  ('11','A','Chemistry',1,'09:00','10:00','Lab 2'),
  ('11','B','English',1,'09:00','10:00','Room 205'),
  ('10','A','Mathematics',1,'10:00','11:00','LH101'),
  ('10','B','Science',1,'10:00','11:00','Lab 1'),
  ('11','A','English',1,'10:00','11:00','Room 204'),
  ('11','B','Computer Science',1,'10:00','11:00','Computer Lab'),
  ('10','A','English',1,'12:00','13:00','LH101'),
  ('10','B','Social Science',1,'12:00','13:00','LH102'),
  ('11','A','Computer Science',1,'12:00','13:00','Computer Lab'),
  ('11','B','Mathematics',1,'12:00','13:00','Room 205'),
  ('10','A','Social Science',1,'13:00','14:00','LH101'),
  ('10','B','Computer Science',1,'13:00','14:00','Computer Lab'),
  ('11','A','Mathematics',1,'13:00','14:00','Room 204'),
  ('11','B','Physics',1,'13:00','14:00','Lab 1'),
  ('10','A','Computer Science',1,'14:00','15:00','Computer Lab'),
  ('10','B','English',1,'14:00','15:00','LH102'),
  ('11','A','Physics',1,'14:00','15:00','Lab 1'),
  ('11','B','Chemistry',1,'14:00','15:00','Lab 2'),
  ('10','A','Mathematics',2,'08:00','09:00','LH101'),
  ('10','B','Science',2,'08:00','09:00','Lab 1'),
  ('11','A','English',2,'08:00','09:00','Room 204'),
  ('11','B','Chemistry',2,'08:00','09:00','Lab 2'),
  ('10','A','Science',2,'09:00','10:00','Lab 1'),
  ('10','B','Mathematics',2,'09:00','10:00','LH102'),
  ('11','A','Chemistry',2,'09:00','10:00','Lab 2'),
  ('11','B','Computer Science',2,'09:00','10:00','Computer Lab'),
  ('10','A','English',2,'10:00','11:00','LH101'),
  ('10','B','Social Science',2,'10:00','11:00','LH102'),
  ('11','A','Computer Science',2,'10:00','11:00','Computer Lab'),
  ('11','B','Mathematics',2,'10:00','11:00','Room 205'),
  ('10','A','Science',2,'12:00','13:00','Lab 1'),
  ('10','B','English',2,'12:00','13:00','LH102'),
  ('11','A','Mathematics',2,'12:00','13:00','Room 204'),
  ('11','B','Computer Science',2,'12:00','13:00','Computer Lab'),
  ('10','A','Social Science',2,'13:00','14:00','LH101'),
  ('10','B','Computer Science',2,'13:00','14:00','Computer Lab'),
  ('11','A','Physics',2,'13:00','14:00','Lab 1'),
  ('11','B','English',2,'13:00','14:00','Room 205'),
  ('10','A','Computer Science',2,'14:00','15:00','Computer Lab'),
  ('10','B','English',2,'14:00','15:00','LH102'),
  ('11','A','Chemistry',2,'14:00','15:00','Lab 2'),
  ('11','B','Physics',2,'14:00','15:00','Lab 1'),
  ('10','A','Mathematics',3,'08:00','09:00','LH101'),
  ('10','B','Science',3,'08:00','09:00','Lab 1'),
  ('11','A','English',3,'08:00','09:00','Room 204'),
  ('11','B','Chemistry',3,'08:00','09:00','Lab 2'),
  ('10','A','Science',3,'09:00','10:00','Lab 1'),
  ('10','B','Mathematics',3,'09:00','10:00','LH102'),
  ('11','A','Chemistry',3,'09:00','10:00','Lab 2'),
  ('11','B','Computer Science',3,'09:00','10:00','Computer Lab'),
  ('10','A','English',3,'10:00','11:00','LH101'),
  ('10','B','Social Science',3,'10:00','11:00','LH102'),
  ('11','A','Computer Science',3,'10:00','11:00','Computer Lab'),
  ('11','B','Mathematics',3,'10:00','11:00','Room 205'),
  ('10','A','Social Science',3,'12:00','13:00','LH101'),
  ('10','B','Computer Science',3,'12:00','13:00','Computer Lab'),
  ('11','A','Mathematics',3,'12:00','13:00','Room 204'),
  ('11','B','English',3,'12:00','13:00','Room 205'),
  ('10','A','English',3,'13:00','14:00','LH101'),
  ('10','B','Social Science',3,'13:00','14:00','LH102'),
  ('11','A','Computer Science',3,'13:00','14:00','Computer Lab'),
  ('11','B','Physics',3,'13:00','14:00','Lab 1'),
  ('10','A','Computer Science',3,'14:00','15:00','Computer Lab'),
  ('10','B','English',3,'14:00','15:00','LH102'),
  ('11','A','Physics',3,'14:00','15:00','Lab 1'),
  ('11','B','Mathematics',3,'14:00','15:00','Room 205'),
  ('10','A','Mathematics',4,'08:00','09:00','LH101'),
  ('10','B','Science',4,'08:00','09:00','Lab 1'),
  ('11','A','English',4,'08:00','09:00','Room 204'),
  ('11','B','Chemistry',4,'08:00','09:00','Lab 2'),
  ('10','A','Science',4,'09:00','10:00','Lab 1'),
  ('10','B','Mathematics',4,'09:00','10:00','LH102'),
  ('11','A','Chemistry',4,'09:00','10:00','Lab 2'),
  ('11','B','Computer Science',4,'09:00','10:00','Computer Lab'),
  ('10','A','English',4,'10:00','11:00','LH101'),
  ('10','B','Social Science',4,'10:00','11:00','LH102'),
  ('11','A','Computer Science',4,'10:00','11:00','Computer Lab'),
  ('11','B','Physics',4,'10:00','11:00','Lab 1'),
  ('10','A','Social Science',4,'12:00','13:00','LH101'),
  ('10','B','Computer Science',4,'12:00','13:00','Computer Lab'),
  ('11','A','Mathematics',4,'12:00','13:00','Room 204'),
  ('11','B','English',4,'12:00','13:00','Room 205'),
  ('10','A','Computer Science',4,'13:00','14:00','Computer Lab'),
  ('10','B','English',4,'13:00','14:00','LH102'),
  ('11','A','Physics',4,'13:00','14:00','Lab 1'),
  ('11','B','Mathematics',4,'13:00','14:00','Room 205'),
  ('10','A','Social Science',4,'14:00','15:00','LH101'),
  ('10','B','Computer Science',4,'14:00','15:00','Computer Lab'),
  ('11','A','Mathematics',4,'14:00','15:00','Room 204'),
  ('11','B','Physics',4,'14:00','15:00','Lab 1'),
  ('10','A','Mathematics',5,'08:00','09:00','LH101'),
  ('10','B','Science',5,'08:00','09:00','Lab 1'),
  ('11','A','English',5,'08:00','09:00','Room 204'),
  ('11','B','Chemistry',5,'08:00','09:00','Lab 2'),
  ('10','A','Science',5,'09:00','10:00','Lab 1'),
  ('10','B','Mathematics',5,'09:00','10:00','LH102'),
  ('11','A','Chemistry',5,'09:00','10:00','Lab 2'),
  ('11','B','Computer Science',5,'09:00','10:00','Computer Lab'),
  ('10','A','English',5,'10:00','11:00','LH101'),
  ('10','B','Computer Science',5,'10:00','11:00','Computer Lab'),
  ('11','A','Mathematics',5,'10:00','11:00','Room 204'),
  ('11','B','Physics',5,'10:00','11:00','Lab 1'),
  ('10','A','Computer Science',5,'12:00','13:00','Computer Lab'),
  ('10','B','Mathematics',5,'12:00','13:00','LH102'),
  ('11','A','Physics',5,'12:00','13:00','Lab 1'),
  ('11','B','English',5,'12:00','13:00','Room 205'),
  ('10','A','Social Science',5,'13:00','14:00','LH101'),
  ('10','B','English',5,'13:00','14:00','LH102'),
  ('11','A','Computer Science',5,'13:00','14:00','Computer Lab'),
  ('11','B','Mathematics',5,'13:00','14:00','Room 205'),
  ('10','A','Computer Science',5,'14:00','15:00','Computer Lab'),
  ('10','B','Social Science',5,'14:00','15:00','LH102'),
  ('11','A','Physics',5,'14:00','15:00','Lab 1'),
  ('11','B','English',5,'14:00','15:00','Room 205');

insert into public.timetable (class_id, subject_id, teacher_id, day_of_week, start_time, end_time, room)
select c.id, s.id, ts.teacher_id, t.dow, t.st, t.et, t.room
from demo_tt t
join demo_classes c on c.name = t.class_name and c.section = t.section
join demo_subjects s on s.class_id = c.id and s.subject = t.subject
join public.teacher_subjects ts on ts.subject_id = s.id and ts.class_id = c.id;

-- ---------------------------------------------------------------------
-- 5. Attendance: every weekday of the last 4 weeks (up to yesterday),
--    one row per student per subject taught that day.
-- ---------------------------------------------------------------------
insert into public.attendance (student_id, class_id, subject_id, date, status, marked_by)
select x.student_id, x.class_id, x.subject_id, x.d,
       case
         when x.day_r < x.absent_pct then 'absent'
         when x.day_r < x.absent_pct + 2 then 'leave'
         when x.subj_r < 4 then 'late'
         else 'present'
       end,
       x.teacher_id
from (
  select su.id as student_id, c.id as class_id, tt.subject_id, tt.teacher_id, g.d,
         abs(hashtext(ds.seq::text || '|' || g.d::text)) % 100 as day_r,
         abs(hashtext(ds.seq::text || '|' || tt.subject_id::text || '|' || g.d::text)) % 100 as subj_r,
         (array[12,6,4,14])[1 + ds.seq % 4] as absent_pct
  from demo_students ds
  join demo_users su on su.role = 'student' and su.seq = ds.seq
  join demo_classes c on c.name = ds.class_name and c.section = ds.section
  cross join generate_series(current_date - 28, current_date - 1, interval '1 day') as gs(ts)
  cross join lateral (select gs.ts::date as d) g
  join (select distinct class_id, subject_id, teacher_id, day_of_week from public.timetable) tt
    on tt.class_id = c.id and tt.day_of_week = extract(dow from g.d)::int
  where extract(dow from g.d) between 1 and 5
) x
on conflict (student_id, subject_id, date) do nothing;

-- ---------------------------------------------------------------------
-- 6. Exams, marks, results
-- ---------------------------------------------------------------------
insert into public.exams (name, class_id, term, start_date, end_date)
select e.name, c.id, e.term, current_date + e.s, current_date + e.e
from demo_classes c
cross join (values
  ('Unit Test 1', 'Term 1', -45, -43),
  ('Mid Term',    'Term 1', -25, -18),
  ('Unit Test 2', 'Term 2', -9,  -7),
  ('Final Term',  'Term 2', 12,  20)
) as e(name, term, s, e);

insert into public.marks (student_id, exam_id, subject_id, marks_obtained, max_marks, entered_by)
select su.id, ex.id, sb.id,
       greatest(0, least(mx.m, round(mx.m * (
         ds.base
         + (case sb.subject when 'Mathematics' then 2 when 'Science' then -2 when 'Physics' then -2 when 'Chemistry' then -3
                            when 'English' then 4 when 'Social Science' then -8 when 'Computer Science' then 5 else 0 end)
         + (case ex.name when 'Unit Test 1' then -3 when 'Mid Term' then 0 else 2 end)
         + (abs(hashtext(ds.seq::text || sb.subject || ex.name)) % 7) - 3
       ) / 100.0))),
       mx.m, ts.teacher_id
from demo_students ds
join demo_users su on su.role = 'student' and su.seq = ds.seq
join demo_classes c on c.name = ds.class_name and c.section = ds.section
join public.exams ex on ex.class_id = c.id and ex.name in ('Unit Test 1','Mid Term','Unit Test 2')
join demo_subjects sb on sb.class_id = c.id
join public.teacher_subjects ts on ts.subject_id = sb.id
cross join lateral (select case when ex.name like 'Unit Test%' then 50 else 100 end as m) mx
-- Class 10-B Mathematics marks for Unit Test 2 are intentionally still pending (shows in teacher dashboard)
where not (c.name = '10' and c.section = 'B' and ex.name = 'Unit Test 2' and sb.subject = 'Mathematics');

-- Published results ONLY for evaluated students (marks for every subject of the class).
-- 10-B Unit Test 2 has no Mathematics marks yet -> those students stay "incomplete".
insert into public.results (student_id, exam_id, total_marks, percentage, grade, rank, published)
select student_id, exam_id, total, pct, public.grade_for(pct),
       (rank() over (partition by exam_id order by pct desc))::int, true
from (
  select m.student_id, m.exam_id, sum(m.marks_obtained) as total,
         round(sum(m.marks_obtained) * 100.0 / sum(m.max_marks), 1) as pct
  from public.marks m
  join public.exams ex on ex.id = m.exam_id
  group by m.student_id, m.exam_id, ex.class_id
  having count(distinct m.subject_id) = (select count(*) from public.subjects sb where sb.class_id = ex.class_id)
) r;

-- ---------------------------------------------------------------------
-- 7. Fees: structure per class + a payment row per student per fee
-- ---------------------------------------------------------------------
insert into public.fee_structure (class_id, academic_year, fee_type, amount, due_date)
select c.id, '2026-27', f.fee_type,
       case when c.name = '10' then f.a10 else f.a11 end,
       current_date + f.due
from demo_classes c
cross join (values
  ('Tuition Fee - Term 1',  15000, 17500, -60),
  ('Lab & Activity Fee',     4500,  5500, -30),
  ('Tuition Fee - Term 2',  15000, 17500,  20)
) as f(fee_type, a10, a11, due);

insert into public.fee_payments (student_id, fee_structure_id, amount_paid, payment_date, mode, status,
                                 reference_note, receipt_no, submitted_by, verified_by, verified_at, rejection_reason, recorded_by)
select su.id, fs.id,
       case p.status when 'paid' then fs.amount when 'partial' then p.part when 'due' then 0 else fs.amount end,
       case when p.status = 'due' then null else current_date - (3 + ds.seq * 2) end,
       case when p.status = 'due' then null else (array['UPI','Bank Transfer','Cash'])[1 + ds.seq % 3] end,
       p.status,
       case when p.status in ('pending_verification','rejected') then 'UPI ref ' || (400000 + ds.seq * 137 + p.k) end,
       case when p.status in ('paid','partial') then 'RCPT-2026-' || lpad((ds.seq * 10 + p.k)::text, 6, '0') end,
       case when p.status <> 'due' then su.id end,
       case when p.status in ('paid','partial','rejected') then (select id from demo_users where role = 'admin') end,
       case when p.status in ('paid','partial','rejected') then now() - (interval '1 day' * (2 + ds.seq)) end,
       case when p.status = 'rejected' then 'Reference number could not be matched with the bank statement.' end,
       case when p.status in ('paid','partial') then (select id from demo_users where role = 'admin') end
from demo_students ds
join demo_users su on su.role = 'student' and su.seq = ds.seq
join demo_classes c on c.name = ds.class_name and c.section = ds.section
join public.fee_structure fs on fs.class_id = c.id
join lateral (
  select
    case fs.fee_type when 'Tuition Fee - Term 1' then 1 when 'Lab & Activity Fee' then 2 else 3 end as k,
    case fs.fee_type
      when 'Tuition Fee - Term 1' then
        case ds.seq when 7 then 'partial' when 12 then 'due' when 6 then 'pending_verification' else 'paid' end
      when 'Lab & Activity Fee' then
        case ds.seq when 2 then 'pending_verification' when 3 then 'rejected' when 9 then 'due'
                    when 10 then 'partial' when 11 then 'due' else 'paid' end
      else
        case ds.seq when 1 then 'partial' when 4 then 'paid' when 8 then 'pending_verification' else 'due' end
    end as status,
    case when ds.seq = 1 then 7500 when ds.seq = 7 then 8000 else 2500 end as part
) p on true;

-- ---------------------------------------------------------------------
-- 8. Notices and events
-- ---------------------------------------------------------------------
insert into public.notices (title, content, target_role, target_class_id, posted_by, pinned, expiry_date, created_at)
select n.title, n.content, n.target_role, c.id, u.id, n.pinned, n.expiry::date, now() - n.ago
from (values
  ('Final Term schedule published', 'Final Term examinations begin on ' || to_char(current_date + 12, 'DD Mon YYYY') || '. The detailed date sheet is available with your class teacher.', 'all', null, 'admin@campusdesk.com', true, null, interval '2 hours'),
  ('Maths worksheet due Friday', 'Please complete Worksheet 7 (Quadratic Equations) and submit it by Friday morning.', 'all', '10-A', 'teacher1@campusdesk.com', false, null, interval '10 minutes'),
  ('Parent-Teacher Meeting', 'The Parent-Teacher Meeting is on ' || to_char(current_date + 6, 'DD Mon YYYY') || ' at 10:00 AM in the School Auditorium. Parents are requested to attend.', 'parents', null, 'admin@campusdesk.com', false, null, interval '1 day'),
  ('Library books due', 'Students are requested to return all borrowed library books before the end of this week.', 'students', null, 'admin@campusdesk.com', false, null, interval '3 days'),
  ('Staff meeting: assessment policy', 'All teachers are requested to attend the staff meeting on assessment policy this Saturday at 2:00 PM.', 'teachers', null, 'admin@campusdesk.com', false, null, interval '2 days'),
  ('Diwali break announced', 'The school will remain closed for the Diwali break. Regular classes resume after the holidays.', 'all', null, 'admin@campusdesk.com', false, null, interval '4 days'),
  ('Computer Lab safety rules', 'Please follow the lab safety rules displayed outside the Computer Lab. Food and drinks are not allowed.', 'all', '11-A', 'teacher5@campusdesk.com', false, null, interval '5 days'),
  ('Welcome to the new academic year', 'Welcome to academic year 2026-27! Please keep your profile details up to date.', 'all', null, 'admin@campusdesk.com', true, null, interval '30 days')
) as n(title, content, target_role, class_label, poster, pinned, expiry, ago)
join demo_users u on u.email = n.poster
left join demo_classes c on (c.name || '-' || c.section) = n.class_label;

insert into public.events (title, description, event_date, start_time, event_type, location, created_by)
select e.title, e.description, current_date + e.d, e.t::time, e.type, e.location, u.id
from (values
  ('Computer Club Workshop', 'Hands-on introduction to web development for interested students.', 3, '14:30', 'activity', 'Computer Lab', 'teacher5@campusdesk.com'),
  ('Parent-Teacher Meeting', 'Discuss your child''s progress with class teachers.', 6, '10:00', 'meeting', 'School Auditorium', 'admin@campusdesk.com'),
  ('Science Exhibition', 'Students showcase working models and projects.', 9, '10:30', 'activity', 'Main Hall', 'admin@campusdesk.com'),
  ('Final Term Examinations begin', 'Final Term examinations start for classes 10 and 11.', 12, '09:00', 'exam', 'Examination Hall', 'admin@campusdesk.com'),
  ('Fee payment deadline - Term 2', 'Last date to pay Term 2 tuition fees without penalty.', 20, null, 'deadline', 'Accounts Office', 'admin@campusdesk.com'),
  ('Diwali Break begins', 'School closed for the Diwali holidays.', 25, null, 'holiday', 'Campus', 'admin@campusdesk.com'),
  ('Annual Sports Day', 'Inter-house athletics and team events.', 35, '08:00', 'activity', 'School Ground', 'admin@campusdesk.com'),
  ('Inter-house Quiz', 'Inter-house general knowledge quiz (completed).', -10, '11:00', 'activity', 'Main Hall', 'admin@campusdesk.com')
) as e(title, description, d, t, type, location, creator)
join demo_users u on u.email = e.creator;

-- ---------------------------------------------------------------------
-- 9. Leave requests, teacher queries
-- ---------------------------------------------------------------------
insert into public.leave_requests (requester_id, requester_role, from_date, to_date, reason, status, approved_by, created_at)
select u.id, u.role, current_date + l.f, current_date + l.t, l.reason, l.status,
       case when l.status <> 'pending' then (select id from demo_users where role = 'admin') end,
       now() - l.ago
from (values
  ('student2@campusdesk.com',  2, 3, 'Fever and doctor-advised rest',        'pending',  interval '3 hours'),
  ('student5@campusdesk.com', -6, -5, 'Family function out of town',          'approved', interval '9 days'),
  ('student7@campusdesk.com', -3, -3, 'Personal work',                        'rejected', interval '5 days'),
  ('student9@campusdesk.com',  5, 6, 'Inter-school sports selection trials', 'pending',  interval '1 day'),
  ('teacher3@campusdesk.com',  8, 9, 'Attending a conference',               'pending',  interval '2 days'),
  ('teacher6@campusdesk.com', -12, -11, 'Family event',                       'approved', interval '14 days')
) as l(email, f, t, reason, status, ago)
join demo_users u on u.email = l.email;

update public.leave_requests set rejection_reason = 'Exam week - leave cannot be granted.' where status = 'rejected';

insert into public.teacher_queries (student_id, sender_id, sender_role, teacher_id, query_type, message, reply, status, created_at, replied_at)
select s.id, snd.id, snd.role, t.id, q.qtype, q.msg, q.reply, case when q.reply is null then 'open' else 'answered' end,
       now() - q.ago, case when q.reply is not null then now() - q.ago + interval '3 hours' end
from (values
  ('student1@campusdesk.com', 'student1@campusdesk.com', 'teacher1@campusdesk.com', 'Doubt', 'Ma''am, could you please explain the discriminant method again for Worksheet 7?', null, interval '5 hours'),
  ('student1@campusdesk.com', 'student1@campusdesk.com', 'teacher5@campusdesk.com', 'Assignment', 'Is the CS project submission date extended?', 'Yes, you can submit it by next Monday.', interval '3 days'),
  ('student1@campusdesk.com', 'parent1@campusdesk.com',  'teacher3@campusdesk.com', 'Progress', 'Could you share feedback on Aarav''s English essays?', null, interval '1 day'),
  ('student4@campusdesk.com', 'student4@campusdesk.com', 'teacher2@campusdesk.com', 'Doubt', 'Please suggest reference material for the electricity chapter.', null, interval '2 days')
) as q(student_email, sender_email, teacher_email, qtype, msg, reply, ago)
join demo_users s   on s.email = q.student_email
join demo_users snd on snd.email = q.sender_email
join demo_users t   on t.email = q.teacher_email;

-- ---------------------------------------------------------------------
-- 10. Audit log (feeds the admin "Recent activity" panel)
-- ---------------------------------------------------------------------
insert into public.audit_logs (actor_id, action, target_table, details, created_at)
select u.id, a.action, a.tbl, a.details::jsonb, now() - a.ago
from (values
  ('teacher1@campusdesk.com', 'post_notice',       'notices',        '{"title":"Maths worksheet due Friday"}', interval '10 minutes'),
  ('admin@campusdesk.com',    'post_notice',       'notices',        '{"title":"Final Term schedule published"}', interval '2 hours'),
  ('student2@campusdesk.com', 'request_leave',     'leave_requests', '{"requester":"Diya Kapoor"}', interval '3 hours'),
  ('student2@campusdesk.com', 'submit_fee_payment','fee_payments',   '{"student":"Diya Kapoor","amount":4500}', interval '6 hours'),
  ('admin@campusdesk.com',    'timetable_update',  'timetable',      '{"subject":"Computer Science"}', interval '1 day'),
  ('admin@campusdesk.com',    'publish_results',   'exams',          '{"exam":"Unit Test 2"}', interval '2 days'),
  ('student9@campusdesk.com', 'request_leave',     'leave_requests', '{"requester":"Vihaan Desai"}', interval '1 day'),
  ('admin@campusdesk.com',    'leave_approved',    'leave_requests', '{"requester":"Rohan Gupta"}', interval '8 days'),
  ('teacher5@campusdesk.com', 'post_notice',       'notices',        '{"title":"Computer Lab safety rules"}', interval '5 days'),
  ('admin@campusdesk.com',    'leave_rejected',    'leave_requests', '{"requester":"Arjun Nair"}', interval '4 days'),
  ('admin@campusdesk.com',    'publish_results',   'exams',          '{"exam":"Mid Term"}', interval '16 days'),
  ('admin@campusdesk.com',    'create_exam',       'exams',          '{"exam":"Final Term"}', interval '20 days')
) as a(email, action, tbl, details, ago)
join demo_users u on u.email = a.email;

-- ---------------------------------------------------------------------
-- 11. Notifications (mix of read / unread)
-- ---------------------------------------------------------------------
-- every student + their parent: notice (unread), result (read), event reminder (unread)
insert into public.notifications (user_id, type, title, body, link, is_read, created_at)
select r.uid, x.type, x.title, x.body, x.link, x.is_read, now() - x.ago
from (
  select id as uid from demo_users where role = 'student'
  union all
  select parent_id from public.students where parent_id is not null
) r
cross join (values
  ('notice', 'New notice: Final Term schedule published', 'The Final Term date sheet is available.', '/notices', false, interval '2 hours'),
  ('event',  'Event reminder: Parent-Teacher Meeting',    'Coming up in 6 days.',                    '/events',  false, interval '1 day'),
  ('result', 'Result published: Unit Test 2',             'Your result is now available.',           '/results', true,  interval '2 days')
) as x(type, title, body, link, is_read, ago);

-- extra, student1 / parent1 specific
insert into public.notifications (user_id, type, title, body, link, is_read, created_at)
select u.id, x.type, x.title, x.body, x.link, x.is_read, now() - x.ago
from (values
  ('student1@campusdesk.com', 'fee',       'Payment verified',    'INR 7500 has been recorded against your fees.', '/fees',      false, interval '6 hours'),
  ('student1@campusdesk.com', 'timetable', 'Timetable updated',   'Computer Science was changed in the timetable.', '/timetable', false, interval '1 day'),
  ('student1@campusdesk.com', 'query',     'Your query was answered', 'Yes, you can submit it by next Monday.',      '/chat',      true,  interval '3 days'),
  ('parent1@campusdesk.com',  'fee',       'Payment verified',    'INR 7500 has been recorded against your fees.', '/fees',      false, interval '6 hours')
) as x(email, type, title, body, link, is_read, ago)
join demo_users u on u.email = x.email;

-- teachers
insert into public.notifications (user_id, type, title, body, link, is_read, created_at)
select u.id, x.type, x.title, x.body, x.link, x.is_read, now() - x.ago
from demo_users u
cross join (values
  ('notice', 'New notice: Staff meeting: assessment policy', 'Saturday at 2:00 PM.', '/notices', false, interval '2 days'),
  ('query',  'New student query', 'A student has asked a question.', '/chat', false, interval '5 hours'),
  ('event',  'Event reminder: Parent-Teacher Meeting', 'Coming up in 6 days.', '/events', true, interval '1 day')
) as x(type, title, body, link, is_read, ago)
where u.role = 'teacher';

-- admin
insert into public.notifications (user_id, type, title, body, link, is_read, created_at)
select u.id, x.type, x.title, x.body, x.link, x.is_read, now() - x.ago
from demo_users u
cross join (values
  ('leave', 'New leave request', 'Diya Kapoor requested leave.', '/leave', false, interval '3 hours'),
  ('fee',   'Payment awaiting verification', 'Diya Kapoor submitted INR 4500', '/fees', false, interval '6 hours'),
  ('leave', 'New leave request', 'Priya Nair requested leave.', '/leave', true, interval '2 days')
) as x(type, title, body, link, is_read, ago)
where u.role = 'admin';

commit;
