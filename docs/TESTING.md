# Testing

| Command | What it covers | Needs |
|---|---|---|
| `npm test` | 66 unit/component tests (account routing, login, registration, theme, fees, metrics): attendance policy, fee model, **Pay-button cases 1–4**, report derivation, action items, error messages, CSV | Node only |
| `npm run test:sql` | 173 database assertions (incl. the full account lifecycle) on a **throw-away** PostgreSQL DB loaded from `supabase/v2-fresh/*` (auth/storage stubbed): fee state machine, overpayment, duplicate pending, **concurrent requests / concurrent verification**, results (incomplete data, publish rules), report payload, attendance save, timetable/leave rules, RLS | PostgreSQL + `psql` (`PSQL="psql -U postgres" npm run test:sql`) |
| `tests/integration/consistency.test.js` | Same student → same attendance % and fee numbers on dashboard, fees page, report, attendance page, SQL; admin/teacher aggregates | PostgREST in front of a seeded DB (see header of file) |

## Account-management tests (migration 008)
| Your test | Where it is covered |
|---|---|
| 1-4 existing admin / student / parent / teacher | `auth-flow.test.jsx` (guards + context), SQL "existing accounts keep working", migration applied to a V1-built DB |
| 5 register -> pending, not unauthorized | `auth-flow` (Signup + route), SQL trigger test |
| 6-9 admin sees request, reviews, approves, entity linked | SQL lifecycle tests + `tests/integration/accounts.test.js` (real services) |
| 10-12 approved student / parent (only linked child) / teacher | SQL + integration |
| 13 privilege escalation (role/status) | SQL + integration (browser-style `profiles.update` rejected) |
| 14-16 suspended, reactivated, rejected | `auth-flow`, SQL, integration |
| 17 invalid route -> /unauthorized | `auth-flow` |
| 18 refresh keeps session | **not automated** (supabase-js session persistence; check in a browser) |
| 19 logout/login preserves state | `auth-flow` |
| 20 password reset | **not tested** (needs real Supabase email + PKCE redirect) |

## What was actually run for this delivery
* `npm test` — 66 passed. `npm run test:sql` — 173 passed. `npm run build` — OK.
* Service-level lifecycle (`tests/integration/accounts.test.js`, real services + supabase-js + PostgREST + RLS, one JWT per user): 28 checks; 27 passed in the run and the 28th was a wrong expected count in the test itself (fixed; not re-run).
* Migration 008 applied twice on a database built from V1's SQL + migrations 001-007: existing accounts unchanged (admin/student stay `active`), V1 policies kept.
* Consistency run — 4 students + a parent + admin + teacher: dashboard, report, attendance page and raw SQL agreed for attendance %, and dashboard / fees page / SQL agreed for total, confirmed paid, pending, remaining.
* Migrations 001–007 applied twice to a database built from V1's SQL files; V1 rows survived; fee flow worked on it.
* Dashboard data services were exercised as admin, teacher, student, parent through PostgREST (real SQL + RLS), not in a browser.

## NOT tested (please check manually)
* Visual rendering, responsive layout at each breakpoint, print/PDF output in a real browser.
* Real Supabase GoTrue login/logout/password-reset, Realtime, Storage (signed URLs) and the `create-user` Edge Function.
* The live V1 database (never accessed).
* Browser end-to-end flows (no Playwright/Cypress was run).

Manual QA script: log in as each demo role and walk the checklist in the repository README (§ QA).
