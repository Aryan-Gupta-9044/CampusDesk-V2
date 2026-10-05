# V1 → V2 migration plan

Goal: V1 stays up; V2 is developed alongside; V2 can replace V1 with no data loss.

1. **Stage** — restore a V1 backup into a *new* Supabase project (or branch). Run `supabase/migrations/001–007` there. Point a local V2 build at it. Test with real accounts.
2. **Verify** — `rls_audit.sql`; log in as each role; open Fees (pending/partial/paid), the Academic Report, Results.
3. **Fix data findings** — duplicate pending payments (index warning from 002), students without parents/classes (Admin → System health).
4. **Production** — back up; run 001–007 on production during a quiet period; deploy V2 to a separate URL; V1 keeps working on the same data.
5. **Cut-over** — when V1 is retired, optionally run `900`, deploy the `create-user` function, switch users to the V2 URL.

What changes for existing data: `student_code`/`teacher_code` are generated for rows lacking one; V1's payment note is *copied* into `reference_note`; results that V1 published for students with **missing marks** (0%/F) are *not* modified automatically — re-run *Review & publish* for that exam in V2 to hide them (they become "not evaluated").
