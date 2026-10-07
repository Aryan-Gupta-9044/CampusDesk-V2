# Safe migrations for an EXISTING CampusDesk V1 database  (Option A)

Run **in order**, each in the Supabase SQL Editor. Every file is idempotent (safe to re-run) and non-destructive.

| # | File | What it adds |
|---|---|---|
| 001 | `001_v2_base_compatibility.sql` | `notifications` table; extra nullable columns (timetable.room, events.*, leave_requests.*); widens `fee_payments.status`; RLS helper functions; notification RLS |
| 002 | `002_v2_fee_integrity.sql` | Payment guard trigger, one-pending-per-fee unique index, `get_fee_summary`, `submit_fee_payment`, `verify_fee_payment`, `reject_fee_payment`, `admin_record_payment`, `get_payment_receipt`, receipt numbering |
| 003 | `003_v2_report_support.sql` | `student_code` / `teacher_code` (backfills NULL only), attendance policy function, `grade_for`, `get_student_report` |
| 004 | `004_v2_results_integrity.sql` | `exam_result_status`, `publish_exam_results`, `unpublish_exam_results`, `class_exam_averages` |
| 005 | `005_v2_notifications.sql` | Notification + audit triggers (notice, result, fee, leave, timetable, event, query, absence) |
| 006 | `006_v2_leave_attendance_timetable.sql` | Leave overlap/date rules, timetable conflict rules, `save_attendance`, `attendance_summary_by_class` |
| 007 | `007_v2_indexes.sql` | Performance indexes |
| 008 | `008_v2_auth_account_management.sql` | Registration approval lifecycle: pending/rejected/incomplete states, requested role, secure signup trigger, role-lock trigger, restrictive RLS for non-active accounts, admin provisioning functions. **Read its header first** (changes V1 signup behaviour; see `docs/AUTH_ACCOUNT_MANAGEMENT.md`) |
| — | `900_OPTIONAL_security_hardening.sql` (**superseded by 008 — do not run after 008**) | **Optional.** Signup always creates `student`; non-admins cannot change their role. Changes V1 behaviour — read the header first |

Not touched: your existing V1 tables' rows, existing V1 RLS policies, storage buckets.
Triggers/constraints validate **new** writes only; existing rows are never re-checked or modified (except the NULL `student_code`/`teacher_code` backfill and copying V1's payment note into `reference_note`).

Before 002: run `supabase/audit/rls_audit.sql` query 6 — if duplicate pending payments exist, 002 skips the unique index and prints a warning; resolve them and re-run 002.

**Back up first** (Supabase → Database → Backups, or `pg_dump`), even though nothing here deletes data.
