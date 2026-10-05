# supabase/ — which SQL do I run?

| Folder | Use it when | Safe on an existing V1 database? |
|---|---|---|
| **`migrations/`** (001 → 007) | You already run CampusDesk **V1** and want V2 on the *same* Supabase project (Option A) | **Yes** — additive, idempotent, no `DROP TABLE` / `DELETE` / `TRUNCATE` |
| `migrations/900_OPTIONAL_security_hardening.sql` | Only after reading it (changes V1 signup behaviour) | **Optional — not in the default path** |
| **`v2-fresh/`** (schema → functions → triggers → rls → storage → seed) | You create a **brand-new** Supabase project for V2 / demo (Option B) | **NO — FRESH DATABASE ONLY** |
| `audit/rls_audit.sql` | You want to review your live V1 policies | Yes — read-only SELECTs |
| `functions/create-user/` | You want admin account creation done server-side | n/a (Edge Function) |

Rules enforced by the files themselves:
* `seed.sql` and `reset_demo_data.sql` live **only** in `v2-fresh/` and abort if the database contains a real (non-`@campusdesk.com`) account.
* Nothing in `migrations/` seeds data or deletes rows.
* `v2-fresh/{schema,functions,triggers,rls,storage}.sql` are **generated** from `migrations/` (`npm run build:fresh-sql`) so the two paths cannot drift.

Full instructions: [`docs/DATABASE_SETUP.md`](../docs/DATABASE_SETUP.md).
