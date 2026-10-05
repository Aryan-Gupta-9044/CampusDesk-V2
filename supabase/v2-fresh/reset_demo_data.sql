-- #####################################################################
-- FRESH V2 DATABASE ONLY - DO NOT RUN ON AN EXISTING CAMPUSDESK V1 DATABASE
-- Removes ONLY the demo accounts (*@campusdesk.com) and the demo 2026-27 classes so seed.sql can be re-run.
-- It refuses to run if any real (non-demo) account exists.
-- #####################################################################
do $$
begin
  if exists (select 1 from auth.users where email not like '%@campusdesk.com') then
    raise exception 'ABORTED: real (non-demo) accounts exist. This script is for fresh demo databases only.';
  end if;
end $$;
delete from public.audit_logs   where actor_id in (select id from auth.users where email like '%@campusdesk.com');
delete from public.notices      where posted_by in (select id from auth.users where email like '%@campusdesk.com');
delete from public.events       where created_by in (select id from auth.users where email like '%@campusdesk.com');
delete from auth.users          where email like '%@campusdesk.com';   -- cascades profiles -> students/teachers/payments/...
delete from public.classes      where academic_year = '2026-27';       -- cascades subjects, timetable, exams, fee_structure
