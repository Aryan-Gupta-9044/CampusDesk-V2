#!/usr/bin/env bash
# Database tests for CampusDesk V2 (fees, results, report, RLS, attendance, timetable, leave).
# Creates a THROWAWAY database, loads supabase/v2-fresh/*, runs assertions. Never touches Supabase.
#   PSQL="psql -h localhost -U postgres" DB=cd_test bash tests/sql/run_sql_tests.sh
set -u
PSQL=${PSQL:-psql}; DB=${DB:-cd_sql_test}
ROOT=$(cd "$(dirname "$0")/../.." && pwd); F=$ROOT/supabase/v2-fresh
PASS=0; FAIL=0
$PSQL -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
$PSQL -X -q -d $DB -v ON_ERROR_STOP=1 -f $ROOT/tests/sql/stub_supabase.sql >/dev/null 2>&1 || { echo "stub failed"; exit 2; }
for f in schema functions triggers rls storage seed; do
  $PSQL -X -q -d $DB -v ON_ERROR_STOP=1 -f $F/$f.sql >/dev/null 2>/tmp/sqlt_err.txt || { echo "LOAD FAILED: $f"; grep -v NOTICE /tmp/sqlt_err.txt | head; exit 2; }
done
$PSQL -X -q -d $DB >/dev/null 2>&1 <<'SQL'
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant usage on schema storage to authenticated; grant select, insert, update, delete on storage.objects to authenticated;
revoke update on public.notifications from authenticated; grant update (is_read) on public.notifications to authenticated;
SQL

# q <email|admin|-> "<sql>"  -> runs as that user (RLS applies), prints rows + errors
q() { local who=$1; shift; local f=$(mktemp /tmp/sqlt.XXXXXX.sql)
  { echo "\\set ON_ERROR_STOP off"; echo "\\pset tuples_only on"; echo "\\pset format unaligned"
    if [ "$who" != "-" ]; then echo "select set_config('request.jwt.claim.sub', (select id::text from auth.users where email='$who'), false) as x \\gset"; echo "set role authenticated;"; fi
    echo "$*"; } > $f; chmod 644 $f
  $PSQL -X -q -d $DB -f $f 2>&1 | grep -v "^SET$\|^$"; rm -f $f; }
t() { # t "name" "expected-regex" "$output"
  if echo "$3" | grep -Eq "$2"; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); echo "  FAIL  $1"; echo "        expected /$2/ got: $(echo "$3" | head -3 | tr '\n' '|')"; fi; }
# IDs are resolved as the database owner and passed as literals (the restricted test role cannot read auth.users)
raw() { $PSQL -X -A -t -d $DB -c "$1" 2>/dev/null | head -1; }
uid() { echo "'$(raw "select id from auth.users where email='$1'")'::uuid"; }
fee() { echo "'$(raw "select f.id from public.fee_structure f join public.students s on s.class_id=f.class_id where s.id=(select id from auth.users where email='$1') and f.fee_type like '$2%'")'::uuid"; }
S12=student12@campusdesk.com; S1=student1@campusdesk.com; P1=parent1@campusdesk.com; A=admin@campusdesk.com

echo "== FEES: state machine ($S12, Tuition Term 1, fee 17,500)"
FT1=$(fee $S12 'Tuition Fee - Term 1')
o=$(q $S12 "select status, can_pay, remaining, confirmed_paid, pending_amount from get_fee_summary($(uid $S12)) where fee_type like 'Tuition Fee - Term 1%';")
t "Case1 DUE: pay available" "^due\|t\|17500" "$o"
o=$(q $S12 "select submit_fee_payment($(uid $S12), $FT1, 0, 'UPI', 'x');");        t "zero payment rejected" "invalid_amount" "$o"
o=$(q $S12 "select submit_fee_payment($(uid $S12), $FT1, -50, 'UPI', 'x');");      t "negative payment rejected" "invalid_amount" "$o"
o=$(q $S12 "select submit_fee_payment($(uid $S12), $FT1, 20000, 'UPI', 'x');");    t "Case6 overpayment rejected" "exceeds_remaining" "$o"
o=$(q $S12 "select submit_fee_payment($(uid $S12), $FT1, 10000, 'UPI', 'REF-1') is not null;"); t "valid submit -> pending" "^t$" "$o"
o=$(q $S12 "select status, can_pay, remaining, confirmed_paid, pending_amount, pending_mode, pending_reference from get_fee_summary($(uid $S12)) where fee_type like 'Tuition Fee - Term 1%';")
t "Case2 PENDING: pay hidden, balance unchanged, details present" "^pending_verification\|f\|17500(\.00)?\|0(\.00)?\|10000(\.00)?\|UPI\|REF-1" "$o"
o=$(q $S12 "select submit_fee_payment($(uid $S12), $FT1, 500, 'UPI', 'again');");  t "duplicate pending rejected" "pending_exists" "$o"
o=$(q $S12 "select verify_fee_payment((select id from fee_payments where student_id=$(uid $S12) and status='pending_verification'));"); t "student cannot verify" "not_allowed" "$o"
o=$(q $S12 "update fee_payments set status='paid' where student_id=$(uid $S12) and status='pending_verification'; select count(*) from fee_payments where student_id=$(uid $S12) and status='paid' and fee_structure_id=$FT1;"); t "student cannot self-approve (RLS)" "^0$" "$o"
PID=$(q - "select id from fee_payments where student_id=$(uid $S12) and status='pending_verification' and fee_structure_id=$FT1;")
o=$(q $A "select reject_fee_payment('$PID', 'Reference not found');");              t "admin rejects" "rejected" "$o"
o=$(q $S12 "select status, can_pay, last_rejection_reason from get_fee_summary($(uid $S12)) where fee_type like 'Tuition Fee - Term 1%';"); t "Case3 REJECTED: pay available again" "^rejected\|t\|Reference not found" "$o"
o=$(q $A "select reject_fee_payment('$PID', 'again');");                            t "rejected payment cannot be decided twice" "not_pending" "$o"
o=$(q $S12 "select submit_fee_payment($(uid $S12), $FT1, 10000, 'UPI', 'REF-2') is not null;"); t "resubmit after rejection allowed" "^t$" "$o"
PID2=$(q - "select id from fee_payments where student_id=$(uid $S12) and status='pending_verification' and fee_structure_id=$FT1;")
o=$(q $A "select verify_fee_payment('$PID2');");                                    t "admin verifies -> partial + receipt" "partial.*RCPT-[0-9]{4}-[0-9]{6}" "$o"
o=$(q $A "select verify_fee_payment('$PID2');");                                    t "duplicate verification rejected" "not_pending" "$o"
o=$(q $S12 "select status, can_pay, remaining, confirmed_paid, pending_amount from get_fee_summary($(uid $S12)) where fee_type like 'Tuition Fee - Term 1%';")
t "Case4 APPROVED: balance recalculated, pay available" "^partial\|t\|7500(\.00)?\|10000(\.00)?\|0" "$o"
o=$(q $S12 "select (get_payment_receipt('$PID2'))->>'receipt_no', (get_payment_receipt('$PID2'))->>'student_name';"); t "receipt for verified payment" "RCPT-.*Tanvi Bhatt" "$o"
o=$(q $S12 "select submit_fee_payment($(uid $S12), $FT1, 8000, 'UPI', 'x');");     t "Case6b exceeds remaining after partial" "exceeds_remaining" "$o"
o=$(q $S12 "select submit_fee_payment($(uid $S12), $FT1, 7500, 'UPI', 'REF-3') is not null;"); t "pay exact remainder -> pending" "^t$" "$o"
PID3=$(q - "select id from fee_payments where student_id=$(uid $S12) and status='pending_verification' and fee_structure_id=$FT1;")
o=$(q $A "select get_payment_receipt('$PID3');");                                   t "no receipt for pending payment" "no_receipt" "$o"
# approving a payment after another payment consumed the balance
o=$(q $A "select admin_record_payment($(uid $S12), $FT1, 5000, 'cash', 'offline') ->> 'status';"); t "admin offline payment recorded" "partial" "$o"
o=$(q $A "select verify_fee_payment('$PID3');");                                    t "approve after balance consumed -> blocked" "exceeds_remaining" "$o"
o=$(q $A "select reject_fee_payment('$PID3','balance changed');select 1;");        t "reject stale pending" "rejected" "$o"
o=$(q $A "select admin_record_payment($(uid $S12), $FT1, 2500, 'cash', 'last') ->> 'status';"); t "final payment -> paid" "paid" "$o"
o=$(q $S12 "select status, can_pay, remaining from get_fee_summary($(uid $S12)) where fee_type like 'Tuition Fee - Term 1%';"); t "PAID: pay unavailable" "^paid\|f\|0" "$o"
o=$(q $S12 "select submit_fee_payment($(uid $S12), $FT1, 100, 'UPI', 'x');");      t "Case7 payment after fully paid rejected" "already_paid" "$o"
o=$(q $A "insert into fee_payments(student_id,fee_structure_id,amount_paid,status,mode) values ($(uid $S12), $FT1, 100, 'paid','cash');"); t "direct SQL insert also blocked (final authority)" "already_paid" "$o"
o=$(q $A "update fee_payments set amount_paid=1 where id='$PID2';");                t "confirmed payment is immutable" "already_decided" "$o"

echo "== FEES: parent + pending shown on dashboards ($P1 -> student1)"
FT2=$(fee $S1 'Tuition Fee - Term 2')
o=$(q $P1 "select submit_fee_payment($(uid $S1), $FT2, 5000, 'UPI', 'parent ref') is not null;"); t "parent submits for own child" "^t$" "$o"
o=$(q parent2@campusdesk.com "select submit_fee_payment($(uid $S1), $FT2, 100, 'UPI', 'x');"); t "other parent blocked" "not_allowed" "$o"
o=$(q $P1 "select status, can_pay, confirmed_paid, pending_amount from get_fee_summary($(uid $S1)) where fee_type like 'Tuition Fee - Term 2%';"); t "parent sees pending (confirmed unchanged)" "^pending_verification\|f\|7500\|5000" "$o"
o=$(q student2@campusdesk.com "select * from get_fee_summary($(uid $S1));"); t "other student cannot read fee summary" "not_allowed" "$o"

echo "== FEES: concurrency"
FT3=$(fee student9@campusdesk.com 'Tuition Fee - Term 1')   # student9 (11-A) Term 1 is fully paid; use Term 2 (due)
FT3=$(fee student9@campusdesk.com 'Tuition Fee - Term 2')
mk() { local f=$(mktemp /tmp/sqlc.XXXXXX.sql); { echo "\\pset tuples_only on"; echo "select set_config('request.jwt.claim.sub', (select id::text from auth.users where email='$1'), false) as x \\gset"; echo "set role authenticated;"; echo "begin;"; echo "$2"; echo "select pg_sleep($3);"; echo "commit;"; } > $f; chmod 644 $f; echo $f; }
SQLA="select 'A:' || (submit_fee_payment($(uid student9@campusdesk.com), $FT3, 4000, 'UPI', 'race-A') is not null);"
SQLB="select 'B:' || (submit_fee_payment($(uid student9@campusdesk.com), $FT3, 4000, 'UPI', 'race-B') is not null);"
fa=$(mk student9@campusdesk.com "$SQLA" 1.5); fb=$(mk student9@campusdesk.com "$SQLB" 0)
$PSQL -X -q -d $DB -f $fa > /tmp/race_a.txt 2>&1 &
sleep 0.4; $PSQL -X -q -d $DB -f $fb > /tmp/race_b.txt 2>&1 &
wait; ra=$(cat /tmp/race_a.txt /tmp/race_b.txt)
okc=$(echo "$ra" | grep -c "[AB]:t"); errc=$(echo "$ra" | grep -c "pending_exists")
t "Case5 two simultaneous requests: exactly one allowed" "^1 1$" "$okc $errc"
o=$(q - "select count(*) from fee_payments where student_id=$(uid student9@campusdesk.com) and fee_structure_id=$FT3 and status='pending_verification';"); t "only one pending row stored" "^1$" "$o"
# concurrent double-verify of the same payment
PV=$(q - "select id from fee_payments where student_id=$(uid student9@campusdesk.com) and fee_structure_id=$FT3 and status='pending_verification';")
fa=$(mk $A "select 'V1:' || (verify_fee_payment('$PV') ->> 'status');" 1.5); fb=$(mk $A "select 'V2:' || (verify_fee_payment('$PV') ->> 'status');" 0)
$PSQL -X -q -d $DB -f $fa > /tmp/race_a.txt 2>&1 & sleep 0.4; $PSQL -X -q -d $DB -f $fb > /tmp/race_b.txt 2>&1 & wait
ra=$(cat /tmp/race_a.txt /tmp/race_b.txt)
t "concurrent double verification: one wins, one blocked" "^1 1$" "$(echo "$ra" | grep -c 'V[12]:partial') $(echo "$ra" | grep -c 'not_pending')"
o=$(q - "select sum(amount_paid) from fee_payments where student_id=$(uid student9@campusdesk.com) and fee_structure_id=$FT3 and status in ('paid','partial');"); t "confirmed total counted once" "^4000" "$o"
rm -f /tmp/sqlc.*.sql /tmp/race_*.txt

echo "== RESULTS"
EX=$(q - "select e.id from exams e join classes c on c.id=e.class_id where e.name='Unit Test 2' and c.name='10' and c.section='B';")
o=$(q $A "select exam_result_status('$EX');");                       t "pre-publish summary shows incomplete" "\"incomplete\": 3" "$o"
o=$(q $A "select publish_exam_results('$EX');");                     t "publish blocked when incomplete" "incomplete_results" "$o"
o=$(q teacher1@campusdesk.com "select publish_exam_results('$EX', true);"); t "teacher cannot publish" "not_allowed" "$o"
o=$(q student5@campusdesk.com "select publish_exam_results('$EX', true);"); t "student cannot publish" "not_allowed" "$o"
o=$(q $A "select (publish_exam_results('$EX', true)->>'evaluated');"); t "explicit confirm publishes evaluated only" "^0$" "$o"
o=$(q - "select count(*) from results where exam_id='$EX';");        t "missing marks NOT converted to 0/F" "^0$" "$o"
o=$(q student5@campusdesk.com "select count(*) from results where exam_id='$EX';"); t "student sees no result for incomplete exam" "^0$" "$o"
# teacher1 enters the missing Mathematics marks for 10-B students
o=$(q teacher1@campusdesk.com "insert into marks(student_id,exam_id,subject_id,marks_obtained,max_marks,entered_by) select s.id,'$EX',(select sb.id from subjects sb join classes c on c.id=sb.class_id where sb.name='Mathematics' and c.name='10' and c.section='B'),40,50,auth.uid() from students s join classes c on c.id=s.class_id where c.name='10' and c.section='B'; select exam_result_status('$EX')->>'evaluated';"); t "teacher entered marks -> all evaluated" "3" "$o"
o=$(q $A "select (publish_exam_results('$EX')->>'published');");     t "complete exam publishes" "^3$" "$o"
o=$(q student5@campusdesk.com "select percentage is not null, grade from results where exam_id='$EX' and student_id=$(uid student5@campusdesk.com);"); t "student sees own published result" "^t\|" "$o"
o=$(q teacher4@campusdesk.com "update marks set marks_obtained=1 where subject_id=(select id from subjects sb join classes c on c.id=sb.class_id where sb.name='Mathematics' and c.name='10' and c.section='A' limit 1); select 'n';"); t "teacher cannot edit another teacher's subject marks" "^n$" "$(echo "$o" | tail -1)"

echo "== REPORT"
o=$(q $S1 "select r->'student'->>'student_code', r->'student'->>'roll_no', r->'student'->>'class_name', r->'student'->>'section', r->'student'->>'academic_year', r->'student'->>'email', r->'student'->>'phone' from (select get_student_report($(uid $S1)) r) x;"); t "profile: code, roll, class, section, year, email, phone" "^STU-[0-9]{4}-[0-9]+\|10A01\|10\|A\|2026-27\|student1@campusdesk.com\|\+91" "$o"
o=$(q $S1 "select r->'class_teacher'->>'name', r->'class_teacher'->>'email', r->'class_teacher'->>'phone' from (select get_student_report($(uid $S1)) r) x;"); t "class teacher name/email/phone" "^Anita Sharma\|teacher1@campusdesk.com\|\+91" "$o"
o=$(q $S1 "select r->'guardian'->>'name', r->'guardian'->>'email', r->'guardian'->>'phone' from (select get_student_report($(uid $S1)) r) x;"); t "guardian name/email/phone" "^Rajesh Mehta\|parent1@campusdesk.com\|\+91" "$o"
o=$(q $S1 "select jsonb_array_length(r->'attendance') >= 5, jsonb_array_length(r->'marks') >= 10, jsonb_array_length(r->'results') >= 3 from (select get_student_report($(uid $S1)) r) x;"); t "attendance by subject + marks + results present" "^t\|t\|t$" "$o"
o=$(q $P1 "select get_student_report($(uid $S1))->'student'->>'name';"); t "parent can open child's report" "Aarav Mehta" "$o"
o=$(q student2@campusdesk.com "select get_student_report($(uid $S1));"); t "other student blocked" "not_allowed" "$o"
o=$(q parent2@campusdesk.com "select get_student_report($(uid $S1));"); t "other parent blocked" "not_allowed" "$o"
o=$(q teacher1@campusdesk.com "select get_student_report($(uid $S1))->'student'->>'name';"); t "teaching teacher can open report" "Aarav Mehta" "$o"
o=$(q student1@campusdesk.com "select count(*) from jsonb_array_elements(get_student_report($(uid $S1))->'results') x where (x->>'published')::boolean = false;"); t "student report has only published results" "^0$" "$o"

echo "== ATTENDANCE"
CL=$(q - "select id from classes where name='10' and section='A';"); SB=$(q - "select sb.id from subjects sb where sb.class_id='$CL' and sb.name='Mathematics';")
ROWS="(select jsonb_agg(jsonb_build_object('student_id', id, 'status', case when roll_no like '%02' then 'absent' else 'present' end)) from students where class_id='$CL')"
o=$(q teacher1@campusdesk.com "select save_attendance('$CL','$SB', current_date, $ROWS);"); t "teacher saves roster" "inserted\": 4" "$o"
o=$(q teacher1@campusdesk.com "select save_attendance('$CL','$SB', current_date, $ROWS);"); t "saving again updates (no duplicates)" "updated\": 4" "$o"
o=$(q - "select count(*) from attendance where subject_id='$SB' and date=current_date;"); t "exactly one record per student" "^4$" "$o"
o=$(q teacher4@campusdesk.com "select save_attendance('$CL','$SB', current_date, $ROWS);"); t "unassigned teacher blocked" "not_allowed" "$o"
o=$(q teacher1@campusdesk.com "select save_attendance('$CL','$SB', current_date + 3, $ROWS);"); t "future date blocked" "future_date" "$o"
o=$(q - "select count(*) from notifications where title='Marked absent' and created_at > now() - interval '1 minute';"); t "absence notification created" "^[1-9]" "$o"

echo "== TIMETABLE / LEAVE"
o=$(q $A "insert into timetable(class_id,subject_id,teacher_id,day_of_week,start_time,end_time,room) select class_id,subject_id,teacher_id,day_of_week,start_time,end_time,'X' from timetable limit 1;"); t "same class+period conflict blocked" "class_conflict" "$o"
T1=$(raw "select id from auth.users where email='teacher1@campusdesk.com'")
C10A=$(raw "select id from classes where name='10' and section='A'"); C11B=$(raw "select id from classes where name='11' and section='B'")
S10A=$(raw "select id from subjects where class_id='$C10A' limit 1"); S11B=$(raw "select id from subjects where class_id='$C11B' limit 1")
o=$(q $A "insert into timetable(class_id,subject_id,teacher_id,day_of_week,start_time,end_time) values ('$C10A','$S10A','$T1',1,'16:00','17:00'); select 'first ok';"); t "late period added" "first ok" "$o"
o=$(q $A "insert into timetable(class_id,subject_id,teacher_id,day_of_week,start_time,end_time) values ('$C11B','$S11B','$T1',1,'16:30','17:30');"); t "same teacher overlapping period (other class) blocked" "teacher_conflict" "$o"
o=$(q student3@campusdesk.com "insert into leave_requests(requester_id,requester_role,from_date,to_date,reason) values (auth.uid(),'student',current_date+5,current_date+4,'x');"); t "leave: end before start blocked" "invalid_dates" "$o"
o=$(q student2@campusdesk.com "insert into leave_requests(requester_id,requester_role,from_date,to_date,reason) values (auth.uid(),'student',current_date+3,current_date+6,'overlap');"); t "leave: overlapping request blocked" "leave_overlap" "$o"

echo "== SECURITY (RLS)"
o=$(q $S1 "select count(*) from students where id <> auth.uid();"); t "student cannot list other students" "^0$" "$o"
o=$(q $S1 "select count(*) from attendance where student_id <> auth.uid();"); t "student cannot read others' attendance" "^0$" "$o"
o=$(q $S1 "select count(*) from fee_payments where student_id <> auth.uid();"); t "student cannot read others' fees" "^0$" "$o"
o=$(q $S1 "select count(*) from marks where student_id <> auth.uid();"); t "student cannot read others' marks" "^0$" "$o"
o=$(q $S1 "update profiles set role='admin' where id=auth.uid();"); t "student cannot change own role" "role_locked" "$o"
o=$(q $S1 "insert into notices(title,content,target_role,posted_by) values ('x','y','all',auth.uid());"); t "student cannot post notices" "row-level security" "$o"
o=$(q $S1 "insert into results(student_id,exam_id,published) select auth.uid(), id, true from exams limit 1;"); t "student cannot write results" "row-level security" "$o"
o=$(q $S1 "insert into notifications(user_id,title) values (auth.uid(),'forged');"); t "user cannot forge notifications" "row-level security|permission denied" "$o"
o=$(q $P1 "select count(*) from students where parent_id <> auth.uid();"); t "parent sees only own children" "^0$" "$o"
o=$(q $P1 "select count(*) from attendance where student_id not in (select id from students where parent_id=auth.uid());"); t "parent cannot read other families' attendance" "^0$" "$o"
o=$(q teacher4@campusdesk.com "select count(*) from fee_payments;"); t "teacher cannot read fees" "^0$" "$o"
o=$(q $S1 "select count(*) from audit_logs;"); t "student cannot read audit log" "^0$" "$o"
o=$(q $S1 "select count(*) from notifications where user_id <> auth.uid();"); t "user sees only own notifications" "^0$" "$o"
o=$(q $A "select count(*) from students;"); t "admin sees all students" "^12$" "$o"
o=$(q $S1 "insert into storage.objects(bucket_id,name) values ('documents','$(raw "select id from auth.users where email='student2@campusdesk.com'")/secret.pdf');"); t "private documents: cannot write into another user's folder" "row-level security" "$o"

echo "== ACCOUNT LIFECYCLE (registration -> approval -> provisioning)"
NEWSTU=newstu@example.org; NEWPAR=newpar@example.org; NEWTCH=newtch@example.org; NEWREJ=newrej@example.org; EVIL=evil@example.org; NEWINC=newinc@example.org
reg() { q - "insert into auth.users(email, raw_user_meta_data) values ('$1', jsonb_build_object('role','admin','requested_role','$2','full_name','$3','phone','+91 90000 00001'));"; }
reg $NEWSTU student "New Student" >/dev/null; reg $NEWPAR parent "New Parent" >/dev/null; reg $NEWTCH teacher "New Teacher" >/dev/null
reg $NEWREJ student "Rejected Person" >/dev/null; reg $NEWINC teacher "Incomplete Person" >/dev/null
q - "insert into auth.users(email, raw_user_meta_data) values ('$EVIL', jsonb_build_object('role','admin','requested_role','admin','full_name','Evil'));" >/dev/null
o=$(q - "select status, role, requested_role from profiles where email='$NEWSTU';"); t "TEST5/2: signup (even claiming role=admin) -> PENDING, requested role stored separately" "^pending\|student\|student$" "$o"
o=$(q - "select status, role, coalesce(requested_role,'none') from profiles where email='$EVIL';"); t "TEST17: public signup can NOT request or become admin" "^pending\|student\|none$" "$o"
o=$(q - "select count(*) from notifications n join profiles p on p.id=n.user_id where p.role='admin' and n.type='account' and n.body like '%New Student%';"); t "admin notified of the new registration" "^1$" "$o"
o=$(q - "select count(*) from audit_logs where action='account_registered';"); t "registration written to audit log" "^[1-9]" "$o"

echo "-- pending account is locked out of application data"
o=$(q $NEWSTU "select count(*) from classes;"); t "pending: cannot read classes" "^0$" "$o"
o=$(q $NEWSTU "select count(*) from notices;"); t "pending: cannot read notices" "^0$" "$o"
o=$(q $NEWSTU "select count(*) from events;"); t "pending: cannot read events" "^0$" "$o"
o=$(q $NEWSTU "select count(*) from profiles where id <> auth.uid();"); t "pending: cannot read other people's profiles (emails/phones)" "^0$" "$o"
o=$(q $NEWSTU "select count(*) from profiles where id = auth.uid();"); t "pending: can read own profile" "^1$" "$o"
o=$(q $NEWSTU "select get_my_role() is null, is_admin();"); t "pending: no effective role, not admin" "^t\|f$" "$o"
o=$(q $NEWSTU "select my_account_state()->>'status';"); t "my_account_state() reports pending" "^pending$" "$o"
o=$(q $NEWSTU "select get_student_report($(uid $S1));"); t "pending: cannot open another student's report" "not_allowed" "$o"
echo "-- privilege escalation attempts from the browser"
o=$(q $NEWSTU "update profiles set role='admin' where id=auth.uid();"); t "TEST13/15: cannot change own role" "role_locked" "$o"
o=$(q $NEWSTU "update profiles set status='active' where id=auth.uid();"); t "TEST13/16: cannot activate self" "role_locked" "$o"
o=$(q $NEWSTU "update profiles set requested_role='teacher' where id=auth.uid();"); t "cannot change requested_role after submitting" "role_locked" "$o"
o=$(q $NEWSTU "update profiles set decided_at=now() where id=auth.uid();"); t "cannot forge approval fields" "role_locked" "$o"
o=$(q $NEWSTU "insert into profiles(id,role,status,email) values (gen_random_uuid(),'admin','active','x@x');"); t "cannot insert a profile row" "role_locked|row-level security" "$o"
o=$(q $NEWSTU "insert into students(id,roll_no) values (auth.uid(),'HACK1');"); t "cannot provision self as a student" "row-level security" "$o"
o=$(q $NEWSTU "insert into teachers(id,employee_id) values (auth.uid(),'HACK');"); t "cannot provision self as a teacher" "row-level security" "$o"
o=$(q $NEWSTU "update profiles set phone='+91 91111 11111' where id=auth.uid(); select 'ok';"); t "safe self-edit (phone) still works" "UPDATE 1|ok" "$o"
o=$(q $NEWSTU "select admin_provision_account($(uid $NEWSTU),'student','{}'::jsonb,true);"); t "pending: cannot call admin provisioning" "not_allowed" "$o"
o=$(q $NEWSTU "select admin_promote_to_admin($(uid $NEWSTU));"); t "cannot self-promote to admin" "not_allowed" "$o"
o=$(q $S1 "select admin_list_accounts();"); t "student cannot list accounts" "not_allowed" "$o"
o=$(q teacher1@campusdesk.com "select admin_account_counts();"); t "teacher cannot use account admin" "not_allowed" "$o"
o=$(q $S1 "select * from campusdesk_settings;"); t "settings table is admin-only" "^$|row-level|permission" "$o"

echo "-- admin sees and reviews requests"
o=$(q $A "select count(*) from admin_list_accounts('pending');"); t "TEST6: admin lists pending requests" "^6$" "$o"
o=$(q $A "select (admin_account_counts()->>'pending')::int >= 6;"); t "dashboard counter: pending registrations" "^t$" "$o"
o=$(q $A "select full_name, requested_role, status from admin_list_accounts('pending', 'student', 'New Stu');"); t "TEST7: requested role visible; filter + search work" "^New Student\|student\|pending$" "$o"
o=$(q $A "select count(*) from admin_list_accounts(null, null, 'campusdesk.com');"); t "search by email" "^2[0-9]$" "$o"

echo "-- student provisioning (TEST 8-10)"
C10A=$(raw "select id from classes where name='10' and section='A'")
o=$(q $A "select admin_provision_account($(uid $NEWSTU),'student','{}'::jsonb,true);"); t "activation without required fields is refused" "student_fields_required" "$o"
o=$(q $A "select admin_provision_account($(uid $NEWSTU),'student', jsonb_build_object('roll_no','10A01','class_id','$C10A'), true);"); t "duplicate roll number refused" "roll_exists" "$o"
o=$(q $A "select admin_provision_account($(uid $NEWSTU),'admin','{}'::jsonb,true);"); t "admin is not an assignable role" "invalid_role" "$o"
o=$(q $A "select admin_provision_account($(uid $NEWSTU),'student', jsonb_build_object('roll_no','10A99','class_id','$C10A','dob','2011-04-02','gender','Male','parent_id','$(raw "select id from auth.users where email='parent1@campusdesk.com'")'), true)->>'status';"); t "TEST9: approve & activate -> active" "^active$" "$o"
o=$(q - "select p.status, p.role, s.roll_no, s.student_code is not null, s.class_id='$C10A', s.parent_id is not null from profiles p join students s on s.id=p.id where p.email='$NEWSTU';"); t "student entity linked to profile (code, class, parent)" "^active\|student\|10A99\|t\|t\|t$" "$o"
o=$(q $NEWSTU "select my_account_state()->>'status', my_account_state()->>'entity_ok', get_my_role();"); t "TEST10: new student now has an effective student role" "^active\|true\|student$" "$o"
o=$(q $NEWSTU "select count(*) from classes;"); t "approved student can read application data" "^[1-9]" "$o"
o=$(q $NEWSTU "select count(*) from students;"); t "approved student sees only their own record" "^1$" "$o"
o=$(q $NEWSTU "select count(*) from attendance where student_id <> auth.uid();"); t "approved student cannot read other students' data" "^0$" "$o"
o=$(q $P1 "select count(*) from students where id=$(uid $NEWSTU);"); t "linked parent1 can now see the new student too" "^1$" "$o"
o=$(q - "select count(*) from notifications n join profiles p on p.id=n.user_id where p.email='$NEWSTU' and n.title like '%approved%';"); t "applicant notified of approval" "^1$" "$o"

echo "-- parent provisioning (TEST 11)"
CH=$(raw "select id from auth.users where email='student10@campusdesk.com'"); CH2=$(raw "select id from auth.users where email='student3@campusdesk.com'")
o=$(q $A "select admin_provision_account($(uid $NEWPAR),'parent','{}'::jsonb,true);"); t "parent needs at least one child to activate" "parent_children_required" "$o"
o=$(q $A "select admin_provision_account($(uid $NEWPAR),'parent', jsonb_build_object('child_ids', jsonb_build_array('$CH2')), true);"); t "cannot take a child that belongs to another parent" "child_has_parent" "$o"
o=$(q $A "select admin_provision_account($(uid $NEWPAR),'parent', jsonb_build_object('child_ids', jsonb_build_array('$CH')), true)->>'status';"); t "parent approved with a child -> active" "^active$" "$o"
o=$(q $NEWPAR "select count(*) from students;"); t "TEST11: parent sees ONLY the linked child" "^1$" "$o"
o=$(q $NEWPAR "select count(distinct student_id) from attendance;"); t "parent sees attendance of the linked child only" "^1$" "$o"
o=$(q $NEWPAR "select count(*) from fee_payments where student_id <> '$CH';"); t "parent cannot see other children's fees" "^0$" "$o"

echo "-- teacher provisioning (TEST 12)"
SUBM=$(raw "select id from subjects where class_id='$C10A' and name='Mathematics'"); C10B=$(raw "select id from classes where name='10' and section='B'"); C11B=$(raw "select id from classes where name='11' and section='B'")
o=$(q $A "select admin_provision_account($(uid $NEWTCH),'teacher', jsonb_build_object('employee_id','EMP-900'), true);"); t "teacher needs employee id + department" "teacher_fields_required" "$o"
o=$(q $A "select admin_provision_account($(uid $NEWTCH),'teacher', jsonb_build_object('employee_id','EMP-900','department','Mathematics','assignments', jsonb_build_array(jsonb_build_object('class_id','$C11B','subject_id','$SUBM'))), true);"); t "assignment must match subject's class" "invalid_assignment" "$o"
o=$(q $A "select admin_provision_account($(uid $NEWTCH),'teacher', jsonb_build_object('employee_id','EMP-900','department','Mathematics','class_teacher_of', jsonb_build_array('$C10B')), true);"); t "cannot steal another teacher's class-teacher role" "class_has_teacher" "$o"
o=$(q $A "select admin_provision_account($(uid $NEWTCH),'teacher', jsonb_build_object('employee_id','EMP-900','department','Mathematics','qualification','M.Sc.','assignments', jsonb_build_array(jsonb_build_object('class_id','$C10A','subject_id','$SUBM'))), true)->>'status';"); t "teacher approved with class + subject -> active" "^active$" "$o"
o=$(q - "select t.employee_id, t.teacher_code is not null, (select count(*) from teacher_subjects where teacher_id=t.id) from teachers t join profiles p on p.id=t.id where p.email='$NEWTCH';"); t "teacher entity + assignment created" "^EMP-900\|t\|1$" "$o"
o=$(q $NEWTCH "select count(*) from students;"); t "teacher sees only students of assigned classes" "^5$" "$o"
o=$(q $NEWTCH "select count(*) from fee_payments;"); t "teacher cannot read fees" "^0$" "$o"

echo "-- incomplete / rejected / suspended (TEST 7, 8, 14-16)"
o=$(q $A "select admin_provision_account($(uid $NEWINC),'teacher', jsonb_build_object('department','Science'), false)->>'status';"); t "approve-but-finish-later -> incomplete" "^incomplete$" "$o"
o=$(q $NEWINC "select count(*) from classes; select my_account_state()->>'status';"); t "incomplete account gets no application data" "^0$" "$(echo "$o" | head -1)"
t "incomplete state reported" "incomplete" "$o"
o=$(q $A "select admin_reject_account($(uid $NEWREJ), 'Not a registered student.')->>'status';"); t "TEST7: reject -> rejected" "^rejected$" "$o"
o=$(q $NEWREJ "select my_account_state()->>'status', my_account_state()->>'rejection_reason';"); t "rejected user sees reason, status rejected" "^rejected\|Not a registered student\.$" "$o"
o=$(q $NEWREJ "select count(*) from classes;"); t "rejected: no application data" "^0$" "$o"
o=$(q $A "select admin_reject_account($(uid $S1), 'x');"); t "cannot 'reject' an active account (suspend instead)" "not_rejectable" "$o"
o=$(q $A "select admin_suspend_account($(uid $NEWSTU), 'Fees overdue')->>'status';"); t "TEST8: suspend active user" "^suspended$" "$o"
o=$(q $NEWSTU "select my_account_state()->>'status'; select count(*) from students;"); t "suspended: status reported" "suspended" "$o"
t "suspended: no application data (DB-enforced)" "^0$" "$(echo "$o" | tail -1)"
o=$(q $A "select admin_reactivate_account($(uid $NEWSTU))->>'status';"); t "TEST15: reactivate -> active again" "^active$" "$o"
o=$(q $NEWSTU "select count(*) from students;"); t "reactivated student has access again" "^1$" "$o"
o=$(q $A "select admin_suspend_account($(uid $A));"); t "admin cannot suspend self" "cannot_modify_self" "$o"
o=$(q $A "select admin_provision_account($(uid $A),'teacher','{}'::jsonb,true);"); t "cannot convert an admin via provisioning" "cannot_modify_self" "$o"
o=$(q $A "select admin_provision_account($(uid $S1),'teacher', jsonb_build_object('employee_id','E1','department','X'), true);"); t "role change blocked when the account has records" "role_change_blocked" "$o"

echo "-- admin creation is admin-only; admin loses power when suspended"
o=$(q $A "select admin_promote_to_admin($(uid $NEWINC));"); t "cannot promote a non-active account" "not_active" "$o"
o=$(q $A "select admin_promote_to_admin($(uid teacher2@campusdesk.com))->>'role';"); t "existing admin promotes teacher2 to admin" "^admin$" "$o"
o=$(q teacher2@campusdesk.com "select is_admin(), (admin_account_counts()->>'admins')::int;"); t "new admin has admin tools" "^t\|2$" "$o"
o=$(q teacher2@campusdesk.com "select admin_suspend_account($(uid $A))->>'status';"); t "second admin can suspend the first (not the last admin)" "^suspended$" "$o"
o=$(q $A "select is_admin(); select admin_account_counts();"); t "a suspended admin is no longer an admin" "not_allowed" "$o"
o=$(q teacher2@campusdesk.com "select admin_reactivate_account($(uid $A))->>'status';"); t "…and can be reactivated" "^active$" "$o"

echo "-- existing V1/V2 accounts keep working (TEST 1-4, 19)"
o=$(q - "select count(*) from profiles where email like '%@campusdesk.com' and status='active';"); t "all seeded/existing accounts remain active" "^24$" "$o"
o=$(q $A "select get_my_role(), is_admin(), (select count(*) from students);"); t "TEST1: existing admin still admin, sees data" "^admin\|t\|1[0-9]$" "$o"
o=$(q $S1 "select get_my_role(), (select count(*) from students), (select count(*) from classes) > 0;"); t "TEST2: existing student still works" "^student\|1\|t$" "$o"
o=$(q $P1 "select get_my_role(), (select count(*) from students);"); t "TEST3: existing parent still works" "^parent\|[12]$" "$o"
o=$(q teacher1@campusdesk.com "select get_my_role(), (select count(*) from students) > 0;"); t "TEST4: existing teacher still works" "^teacher\|t$" "$o"
o=$(q $S1 "update profiles set phone='+91 92222 22222' where id=auth.uid(); select 'ok';"); t "existing users can still edit safe profile fields" "UPDATE 1|ok" "$o"

echo "-- audit trail"
for a in account_registered account_approved role_assigned student_provisioned teacher_provisioned parent_linked account_rejected account_suspended account_reactivated admin_promoted; do
  o=$(q - "select count(*) from audit_logs where action='$a';"); t "audit: $a" "^[1-9]" "$o"
done

echo "-- opt-in legacy mode (V1 signup behaviour) can never create an admin"
q - "update campusdesk_settings set value='true' where key='allow_legacy_signup_role';" >/dev/null
q - "insert into auth.users(email, raw_user_meta_data) values ('leg-t@example.org', jsonb_build_object('role','teacher','full_name','Legacy T')), ('leg-a@example.org', jsonb_build_object('role','admin','full_name','Legacy A'));" >/dev/null
o=$(q - "select email, role, status from profiles where email like 'leg-%' order by email;"); t "legacy flag: teacher signup active (V1 behaviour), admin signup still pending student" "leg-a@example.org\|student\|pending.*leg-t@example.org\|teacher\|active" "$(echo "$o" | tr '\n' ' ')"
q - "update campusdesk_settings set value='false' where key='allow_legacy_signup_role';" >/dev/null

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
