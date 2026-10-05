# Testing

| Command | What it covers | Needs |
|---|---|---|
| `npm test` | 24 unit/component tests: attendance policy, fee model, **Pay-button cases 1–4**, report derivation, action items, error messages, CSV | Node only |
| `npm run test:sql` | 82 database assertions on a **throw-away** PostgreSQL DB loaded from `supabase/v2-fresh/*` (auth/storage stubbed): fee state machine, overpayment, duplicate pending, **concurrent requests / concurrent verification**, results (incomplete data, publish rules), report payload, attendance save, timetable/leave rules, RLS | PostgreSQL + `psql` (`PSQL="psql -U postgres" npm run test:sql`) |
| `tests/integration/consistency.test.js` | Same student → same attendance % and fee numbers on dashboard, fees page, report, attendance page, SQL; admin/teacher aggregates | PostgREST in front of a seeded DB (see header of file) |

## What was actually run for this delivery
* `npm test` — 24 passed. `npm run test:sql` — 82 passed. `npm run build` — OK.
* Consistency run — 4 students + a parent + admin + teacher: dashboard, report, attendance page and raw SQL agreed for attendance %, and dashboard / fees page / SQL agreed for total, confirmed paid, pending, remaining.
* Migrations 001–007 applied twice to a database built from V1's SQL files; V1 rows survived; fee flow worked on it.
* Dashboard data services were exercised as admin, teacher, student, parent through PostgREST (real SQL + RLS), not in a browser.

## NOT tested (please check manually)
* Visual rendering, responsive layout at each breakpoint, print/PDF output in a real browser.
* Real Supabase GoTrue login/logout/password-reset, Realtime, Storage (signed URLs) and the `create-user` Edge Function.
* The live V1 database (never accessed).
* Browser end-to-end flows (no Playwright/Cypress was run).

Manual QA script: log in as each demo role and walk the checklist in the repository README (§ QA).
