# Database setup

CampusDesk V1 data is treated as **protected**. Nothing in this repository connects to or runs SQL against your Supabase project — you review and execute the SQL yourself.

## A. Existing V1 database — what can be reused
V1 and V2 use the **same core tables and columns** (`profiles, students, teachers, classes, subjects, teacher_subjects, attendance, exams, marks, results, fee_structure, fee_payments, notices, events, timetable, leave_requests, audit_logs, teacher_queries`), the same status values (except fee payments, widened) and the same storage buckets. **Verdict: compatible via additive migrations.**

| Change | Class | Where |
|---|---|---|
| Core tables / columns | A — exists, reused | — |
| `notifications` table | B — new table | 001 |
| timetable.room, events.start_time/end_time/event_type/audience/registration_required, notices.publish_date, leave_requests.leave_type/rejection_reason/decided_at | C — new columns (nullable/defaulted) | 001 |
| fee_payments.reference_note/submitted_by/verified_by/verified_at/rejection_reason/created_at; students.student_code; teachers.teacher_code | C — new columns | 002, 003 |
| Fee status check widened to 5 values | constraint widening | 001 |
| Unique "one pending per student+fee" index, attendance/other indexes | D — new index | 002, 007 |
| `get_fee_summary`, `submit/verify/reject_fee_payment`, `admin_record_payment`, `get_payment_receipt`, `get_student_report`, `exam_result_status`, `publish/unpublish_exam_results`, `class_exam_averages`, `save_attendance`, `attendance_summary_by_class`, `attendance_percent`, `grade_for`, helpers | E — new functions | 001–006 |
| Payment guard, notification/audit, leave, timetable, code-assignment triggers | F — new triggers (validate **new** writes only) | 002, 003, 005, 006 |
| `notifications` policies | G — new-table RLS only; existing V1 policies untouched | 001 |
| Role lock / signup hardening | G — **optional** | 900 |
| Storage | H — none required (V1 buckets reused) | — |

### Execution order (Option A)
1. **Back up** the database.
2. (Optional, read-only) run `supabase/audit/rls_audit.sql` and review.
3. Run `001 → 007` from `supabase/migrations/` in order.
4. Do **not** run anything from `v2-fresh/`.
5. Point the V2 app's `.env` at the same project.
6. (Optional) run `900_OPTIONAL_security_hardening.sql` after reading its header.

V1 keeps working after 001–007: no V1 table loses a column or a policy. Two V1 behaviours become stricter by design (they were bugs): a second pending payment for the same fee and payments exceeding the balance are rejected by the database.

**Caveat — verified against V1's SQL files, not your live database.** I could not see your live schema. The migrations were validated against a database built from V1's own `supabase_schema.sql` + patches. If your live database drifted from those files, run `rls_audit.sql` and apply 001–007 on a **copy** (Supabase branch / restored backup) first.

## B. Fresh V2 database (Option B)
Create a new Supabase project, then run `supabase/v2-fresh/` in order: `schema → functions → triggers → rls → storage → seed`. See `supabase/v2-fresh/README.md`.

## C. Seed data
`v2-fresh/seed.sql` only. Insert-only; aborts if a real account exists or demo data already exists. Creates demo Auth users directly in `auth.users` (bcrypt via pgcrypto) — works in the Supabase SQL Editor; if Supabase changes its auth schema, create the users in Authentication → Users with the same emails and re-run.

## D. Storage buckets
`avatars` (public), `documents` (private, signed URLs 5 min), `receipts` (private). Files live under `<user-id>/…`; policies check the first folder. V1 projects already have `avatars`/`documents` from V1's `storage_policies.sql`.

## E. RLS
Fresh: `v2-fresh/rls.sql` (every table, never disabled). V1: existing policies stay; review with `audit/rls_audit.sql`. Critical rules are *also* in functions/triggers (`SECURITY DEFINER` with explicit `auth.uid()` checks), so the browser cannot publish results, verify payments, change roles or bypass payment rules.

## F. Edge Functions
`supabase/functions/create-user` — admin-only account creation (service-role key stays inside Supabase).
```
supabase functions deploy create-user
```
then set `REACT_APP_USE_EDGE_FUNCTIONS=true` and rebuild. Without it the app uses V1's browser flow (new accounts start as `student`, then the signed-in admin promotes them). **Not run in this build environment — test it once after deploying.**

## G. Rollback
* Migrations are additive: to roll back, simply don't use the V2 app; V1 ignores the new columns/tables/triggers. To remove V2 objects, drop them individually (functions/triggers by name) — there is no automated down-migration, intentionally.
* `900`: re-create V1's `handle_new_user()` and `drop trigger guard_profile_update on public.profiles;`.
* Always keep the pre-migration backup.

## H. Environment variables
`REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY` (anon/publishable only). Optional: `VITE_BASE_PATH`, `REACT_APP_USE_EDGE_FUNCTIONS`. `VITE_`-prefixed equivalents also work.
