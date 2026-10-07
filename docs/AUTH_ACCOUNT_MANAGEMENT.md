# Authentication & account management

## Lifecycle
```
Register (/register)  ->  Supabase Auth user  ->  database trigger creates profile: status = pending, requested_role = <request>
  -> admin notified + audit "account_registered"
  -> user sees /pending-approval (never a dashboard, never /unauthorized)
  -> Admin: Accounts & requests -> Review -> picks the FINAL role -> fills role details -> Approve & activate
  -> one atomic database function: entity row + relationships + profile(role, status=active) + audit + notification
  -> user logs in -> correct dashboard
```
**Authentication** (Supabase session) is separate from **authorization** (active CampusDesk account + role). A session alone unlocks nothing.

## Account states
| State | Meaning | User sees |
|---|---|---|
| `pending` | registered, awaiting review | `/pending-approval` |
| `active` | approved and provisioned | dashboard for the **assigned** role |
| `incomplete` | approved but required record details missing (or active student/teacher without a record) | `/account-setup-required` |
| `suspended` | disabled by an admin (history kept) | `/account-suspended` |
| `rejected` | registration refused (+ optional reason) | `/registration-rejected` |
`/unauthorized` means exactly one thing: an **active** user opened an area their role may not use.

## Roles & who can assign them
* A public applicant may only *request* `student`, `parent` or `teacher` (`profiles.requested_role`). `admin` is never offered, and is ignored if sent.
* The **assigned** role (`profiles.role`) changes only through `admin_provision_account()` (student/parent/teacher) or `admin_promote_to_admin()` (admin→ only an active admin, only an *active* account). For non-active accounts the stored `role` is a placeholder and is ignored everywhere (`get_my_role()` returns NULL, RLS blocks data).
* Entities reuse existing tables: student → `students` (+ `parent_id`), teacher → `teachers` + `teacher_subjects` + `classes.class_teacher_id`, parent → `students.parent_id` (one parent per student, many students per parent). A parent *relationship label* does not exist in the schema, so none is stored.

## Admin workflow (Admin → People → Account Requests)
KPIs (total, pending, active students/teachers/parents, suspended) · filter tabs · role filter · search (name, email, phone, student ID, employee ID) · pagination.
* **Review** a pending request: personal info, registration info, role dropdown (Student/Parent/Teacher), role-specific form, then **Approve & activate**, **Save & finish later** (status `incomplete`), **Reject** (reason), or **Cancel** (stays pending).
* Active accounts: **Edit**, **Suspend** (note), **Make admin**; suspended: **Reactivate** (→ `incomplete` if their record is missing).
* Guards: no self-modification; admins can only be suspended/reactivated; the last active admin can never be suspended; a role cannot be changed once the account has records under it; a parent cannot take a child who belongs to another parent; roll numbers / employee IDs are unique; a teacher assignment must match the subject's class.
Audit actions written to the existing `audit_logs`: `account_registered, account_approved, account_setup_incomplete, role_assigned, student_provisioned, teacher_provisioned, parent_linked, account_rejected, account_suspended, account_reactivated, admin_promoted`. Notifications reuse the existing table (new type `account`).

## Security model
* `handle_new_user()` ignores any client `role`/`status`. (V1's version trusted `raw_user_meta_data.role` — anyone could register as admin through the Auth API.)
* `guard_profile_update` trigger: non-admins cannot INSERT profiles or change id / role / status / requested_role / decision fields. Safe edits (name, phone, avatar) still work. (V1's "user updates own profile" policy was not column-limited.)
* **Restrictive RLS** (`v2_require_active_account`) on every application table and a restrictive select policy on `profiles`: pending / rejected / suspended / incomplete accounts get no data (V1's "authenticated users read all profiles" no longer exposes emails/phones to them). Restrictive policies are AND-ed with existing policies, so V1's own policies are untouched.
* `get_my_role()` / `is_admin()` require `status = 'active'`.
* All admin operations are `SECURITY DEFINER` functions with fixed `search_path`, an explicit active-admin check, `EXECUTE` revoked from `public`, atomic (a failure rolls everything back).
* No service-role key in the frontend. The optional `create-user` Edge Function (service role stays inside Supabase) now creates pre-approved accounts.

## 900_OPTIONAL_security_hardening.sql — reconciled
Its goals (no client-chosen role; role lock on profiles) are implemented in 008, and 008 additionally fixes the status/RLS gaps. **900 is superseded: do not run it after 008** (it would restore V1's `handle_new_user`). It is excluded from the fresh-database build. File left unmodified.

## Required SQL
`supabase/migrations/008_v2_auth_account_management.sql` (placed with 001–007 because that is where the migration chain lives; it requires them). Additive and idempotent; the header lists every change, V1 compatibility notes and rollback. **Not run by this project — review and run it yourself, after a backup.** The frontend degrades safely if 008 is not installed yet (falls back to reading the profile row).
V1 compatibility: all existing accounts stay `active` with their roles. Two V1 behaviours change on a shared database: V1's own "Create account" and browser-side "add teacher/parent" flows now create **pending** accounts (approve them in V2, or set `campusdesk_settings.allow_legacy_signup_role = 'true'` while V1 is still used — it can never create an admin), and V1 suspended users are now blocked in the database too.

## Password reset & sessions
* The Supabase client uses **PKCE**: email links return as `…/CampusDesk-V2/?code=…` (the default *implicit* flow puts tokens in the URL `#fragment`, which collides with hash routing). `requestPasswordReset()` sets `redirectTo` to the app base URL → add it to Supabase **Authentication → URL Configuration → Redirect URLs** (e.g. `https://aryan-gupta-9044.github.io/CampusDesk-V2/`). Open the link in the **same browser** that requested it.
* `/reset-password` also still accepts `?token_hash=…&type=recovery` links from a customised email template.
* Auth state machine: `loading → unauthenticated | error | no_profile | pending | rejected | suspended | incomplete | active`; one account load at a time (stale loads are discarded); no dashboard flash; "Keep me signed in" unticked ends the session when the browser session ends.

## Testing
See `docs/TESTING.md`. Unit/UI (66), database (173), service-level lifecycle (28) cover your TEST 1–20 except where marked there.
