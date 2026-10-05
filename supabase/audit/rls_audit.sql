-- READ-ONLY audit. Safe to run on production: it only SELECTs from system catalogs.
-- Paste into the Supabase SQL editor and review the output.

-- 1) Tables with RLS disabled (should be empty for app tables)
select schemaname, tablename from pg_tables
where schemaname = 'public' and not rowsecurity order by 2;

-- 2) Every policy, by table
select tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies where schemaname = 'public' order by tablename, cmd, policyname;

-- 3) Policies that allow writes on profiles (look for role/status being changeable by the row owner)
select policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'profiles' and cmd in ('UPDATE','ALL','INSERT');

-- 4) Who can write fee_payments directly? (V2 adds a trigger as the final authority either way)
select policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'fee_payments';

-- 5) Storage buckets and whether they are public
select id, name, public from storage.buckets;

-- 6) Duplicate pending payments (must be empty before 002 can create its unique index)
select student_id, fee_structure_id, count(*) from public.fee_payments
where status = 'pending_verification' group by 1, 2 having count(*) > 1;
