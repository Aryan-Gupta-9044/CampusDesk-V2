# CampusDesk V2
Cloud-based student management & campus productivity platform — React 18 + Vite + Supabase.

> **V1 safety:** V1 is the protected baseline. Nothing here touches your Supabase project automatically. Read [`supabase/README.md`](supabase/README.md) and [`docs/DATABASE_SETUP.md`](docs/DATABASE_SETUP.md) before running any SQL.

## 1. Overview & roles
Four roles — **Student, Teacher, Parent (multi-child), Admin** — each with its own sidebar and dashboard. Routes are guarded per role (and again by database RLS). See [`docs/FEATURES.md`](docs/FEATURES.md) for exactly what is and isn't implemented.

## 2. Accounts
Register -> pending approval -> admin assigns role + provisions record -> active. Full details, states, security model and the required migration `008`: [`docs/AUTH_ACCOUNT_MANAGEMENT.md`](docs/AUTH_ACCOUNT_MANAGEMENT.md). Demo accounts below exist only on a fresh database; on a V1 database use your own accounts.

## 2b. Highlights
* **Light / dark / match-device themes** with a soft multi-colour palette ([`docs/THEME.md`](docs/THEME.md)).
* Sidebar layout (collapsible), breadcrumbs, mobile drawer, notification centre, role-aware search.
* Dashboards: today's timetable with current/next class, Action required, KPIs, analytics (Recharts), admin System health.
* **Academic Report**: profile, IDs, class teacher, guardian, subject-wise attendance, marks, exam results, summary, print/PDF.
* **Fees**: confirmed-paid vs pending vs remaining; Pay button hidden while a payment awaits verification; admin verify/reject; official receipts only for verified payments; all rules enforced in PostgreSQL (atomic, race-safe).
* **Results**: missing marks are never 0/F; admin reviews *students / evaluated / incomplete / average / highest / lowest* before publishing.
* **One attendance definition everywhere**: `attended = present + late`, `counted = present + late + absent`, approved leave excluded (`src/lib/metrics.js` ⇄ SQL `attendance_percent`).

## 3. Tech stack & structure
```
src/components/{layout,ui,charts,dashboard,timetable,report,fees}   src/pages/{dashboards,admin,shared,teacher,account,auth}
src/lib/{services,queries}  src/config/navigation.js  src/context  src/hooks  src/styles/theme.css (design tokens)
supabase/{migrations,v2-fresh,functions,audit}   docs/   tests/{unit,sql,integration}   scripts/build-fresh.py
```

## 4. Requirements & install
Node 18+, a Supabase project. Then:
```
npm install
cp .env.example .env     # fill REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY (anon key only!)
npm start                # http://localhost:5173
```

## 5. Database — choose ONE option
| | Option A — existing V1 project | Option B — fresh V2 project |
|---|---|---|
| Run | `supabase/migrations/001 … 008` | `supabase/v2-fresh/` `schema → functions → triggers → rls → storage → seed` |
| Data | keeps all V1 data | demo data only |
| Safe on V1? | yes (additive) | **NO — fresh DB only** |

Never run `v2-fresh/*` on a V1 database. Never run seed on production.

## 6. Demo accounts (fresh DB / `seed.sql` only — DEMO, not production)
| Role | Email | Password |
|---|---|---|
| Admin | admin@campusdesk.com | Admin@123 |
| Teacher | teacher1 … teacher6@campusdesk.com | Teacher@123 |
| Student | student1 … student12@campusdesk.com | Student@123 |
| Parent | parent1 … parent5@campusdesk.com | Parent@123 |

`student1` (Aarav Mehta, 10-A) ↔ `parent1`; `parent2` has two children (shows the child switcher); `teacher1` teaches Mathematics in every class. Seed includes fees in every state (paid, partial, due, pending_verification, rejected), 10-B Unit Test 2 deliberately **incomplete** (to demo review-before-publish), notices, events, leave in every status, queries, notifications, audit log.

## 7. Scripts
`npm start` · `npm run build` · `npm run preview` · `npm test` (unit) · `npm run test:sql` (DB, needs PostgreSQL) · `npm run build:fresh-sql` (regenerate v2-fresh from migrations) · `npm run deploy` (gh-pages).

## 8. Deployment
HashRouter → refresh-safe on static hosting. Env vars are injected **at build time**.
* **GitHub Pages**: add repo secrets `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY` → Settings → Pages → Source *GitHub Actions* → push to `main` (`.github/workflows/deploy.yml`). Manual: `VITE_BASE_PATH=/<repo>/ npm run build && npm run deploy`. Add the Pages URL to Supabase → Auth → URL Configuration (password-reset links).
* **Vercel**: import repo, framework *Vite*, build `npm run build`, output `dist`, add the two env vars.

## 9. Edge Function (optional, recommended)
`supabase functions deploy create-user`, then `REACT_APP_USE_EDGE_FUNCTIONS=true`. Details in `docs/DATABASE_SETUP.md` §F. Untested against a live project.

## 10. Troubleshooting
| Problem | Fix |
|---|---|
| "Missing Supabase env vars" | create `.env` (names above), restart `npm start` |
| Invalid API key / can't connect | use the anon/publishable key; check URL; project not paused |
| `permission denied` / empty lists | SQL order wrong, or RLS script not run; do not disable RLS |
| `function get_fee_summary does not exist` | migrations 002–006 (or fresh `functions.sql`) not run |
| "Profile not found" | auth user has no `profiles` row (run seed, or insert it) |
| No timetable | student needs `class_id` and timetable rows; weekends have no classes |
| Dashboard empty after days | seed dates are relative to the seed day — reload `v2-fresh` seed on a fresh DB |
| Blank GitHub Pages | build with `VITE_BASE_PATH=/<repo>/` |
| Pay button missing | a payment for that fee is awaiting verification (by design) |

## 11. QA checklist (manual, in a browser)
Auth (login/logout/reset/role routing) · Student (dashboard, timetable, attendance, results, report, fees → submit → pending shown → Pay hidden, notifications, profile) · Parent (child switcher, report, fees, history) · Teacher (dashboard, attendance save, marks, queries) · Admin (verify/reject, publish review, fees ledger, health, timetable conflict) · responsive 390/768/1280 · print the Academic Report.

## 12. Known limitations
See `docs/FEATURES.md` ("Not implemented") and `docs/TESTING.md` ("NOT tested"). Notably: no browser/visual testing was possible in the build environment; the Edge Function and real Supabase Auth/Realtime/Storage were not exercised; the live V1 database was never accessed.
