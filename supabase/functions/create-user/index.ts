// Supabase Edge Function: create-user   (admin-only account creation)
//
// Why: creating teacher / parent / admin accounts must not depend on browser-side signUp()
// (which needs a role to be trusted from the client). This function checks the CALLER is an
// admin, then uses the service-role key - which exists only inside Supabase, never in the
// frontend - to create the Auth user, the profile (with the role) and the student/teacher row.
//
// Deploy:   supabase functions deploy create-user
// Secrets:  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are injected by Supabase automatically.
// With migration 008 installed, new Auth users start as `pending`; this function (service role, caller verified as admin)
// is the server-side path that creates an already-approved account in one step.
// NOTE: not executed in the CampusDesk build environment (no Supabase/Deno runtime) - see docs/TESTING.md.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["student", "teacher", "parent", "admin"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // 1) Who is calling? (uses the caller's JWT, subject to RLS)
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthenticated" }, 401);
  const { data: me } = await caller.from("profiles").select("role,status").eq("id", userData.user.id).maybeSingle();
  if (!me || me.role !== "admin" || me.status !== "active") return json({ error: "forbidden" }, 403);

  // 2) Validate input
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { role, email, password, fullName, phone } = b ?? {};
  if (!ROLES.includes(role)) return json({ error: "invalid_role" }, 400);
  if (typeof email !== "string" || !EMAIL.test(email)) return json({ error: "invalid_email" }, 400);
  if (typeof password !== "string" || password.length < 8) return json({ error: "weak_password" }, 400);
  if (typeof fullName !== "string" || !fullName.trim()) return json({ error: "name_required" }, 400);

  // 3) Create with the service role (server-side only)
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(), password, email_confirm: true, user_metadata: { full_name: fullName.trim() },
  });
  if (createErr || !created.user) {
    const dup = /already|registered|exists/i.test(createErr?.message ?? "");
    return json({ error: dup ? "email_exists" : "create_failed" }, dup ? 409 : 400);
  }
  const id = created.user.id;

  const rollback = async (code: string, detail?: string) => {
    await admin.auth.admin.deleteUser(id);            // only ever deletes the account we just created
    return json({ error: code, detail }, 400);
  };

  const { error: pErr } = await admin.from("profiles").upsert({
    id, role, full_name: fullName.trim(), email: email.trim().toLowerCase(), phone: phone ?? null, status: "active",
    requested_role: null, decided_by: userData.user.id, decided_at: new Date().toISOString(),   // admin-created = pre-approved (migration 008 columns)
  });
  if (pErr) return rollback("profile_failed", pErr.message);

  if (role === "teacher") {
    const t = b.teacher ?? {};
    const { error } = await admin.from("teachers").insert({
      id, employee_id: t.employeeId || null, department: t.department || null,
      qualification: t.qualification || null, joining_date: t.joiningDate || null,
    });
    if (error) return rollback("teacher_failed", error.message);
  }
  if (role === "student") {
    const s = b.student ?? {};
    const { error } = await admin.from("students").insert({
      id, roll_no: s.rollNo || null, class_id: s.classId || null, dob: s.dob || null,
      gender: s.gender || null, address: s.address || null, parent_id: s.parentId || null,
    });
    if (error) return rollback("student_failed", error.message);
  }
  if (role === "parent" && b.linkStudentId) {
    const { error } = await admin.from("students").update({ parent_id: id }).eq("id", b.linkStudentId);
    if (error) return rollback("link_failed", error.message);
  }

  await admin.from("audit_logs").insert({ actor_id: userData.user.id, action: `create_${role}`, target_table: "profiles", target_id: id, details: { email } });
  return json({ id });
});
