// Service-level check of the account lifecycle: REAL services + supabase-js + PostgREST + RLS.
// One process per phase; the phase's user JWT is passed as the app's key. Driver: see docs/TESTING.md.
import { supabase } from "../../src/lib/supabaseClient";
import { getAccount, getAccountCounts, listAccounts, promoteToAdmin, provisionAccount, reactivateAccount, rejectAccount, suspendAccount } from "../../src/lib/services/accounts";

const ids = JSON.parse(process.env.IDS); const phase = process.env.PHASE;
const out = []; const check = (name, ok, extra = "") => out.push(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + extra}`);
const msg = (e) => e?.message || "";
const state = async () => (await supabase.rpc("my_account_state")).data;

const phases = {
  async pending_student() {
    let st = await state();
    check("new student is PENDING and requested 'student'", st.status === "pending" && st.requested_role === "student", JSON.stringify(st));
    let r = await supabase.from("classes").select("id"); check("pending user reads no classes", (r.data || []).length === 0, JSON.stringify(r.data));
    r = await supabase.from("profiles").update({ role: "admin", status: "active" }).eq("id", ids.newstu);
    check("TEST 9/13: browser update of role/status is rejected by the database", /role_locked/.test(msg(r.error)), JSON.stringify(r.error));
    r = await supabase.from("profiles").select("role,status").eq("id", ids.newstu).single();
    check("…and nothing changed", r.data.status === "pending" && r.data.role === "student", JSON.stringify(r.data));
    r = await supabase.rpc("admin_provision_account", { p_user: ids.newstu, p_role: "student", p_data: {}, p_activate: true });
    check("pending user cannot call admin provisioning", /not_allowed/.test(msg(r.error)), JSON.stringify(r.error));
  },
  async admin_review_and_approve() {
    const counts = await getAccountCounts(); check("admin counts show pending registrations", counts.pending >= 4, JSON.stringify(counts));
    const list = await listAccounts({ status: "pending", search: "E2E" });
    check("TEST 6: registrations appear in Account Requests with requested role", list.rows.length === 5 && list.rows.some((x) => x.requested_role === "parent"), JSON.stringify(list.rows.map((x) => [x.full_name, x.requested_role])));
    const acct = await getAccount(ids.newstu); check("TEST 7: review data (requested role, status, email)", acct.requested_role === "student" && acct.status === "pending" && acct.email === "e2e-student@example.org");
    const c10a = (await supabase.from("classes").select("id,name,section")).data.find((c) => c.name === "10" && c.section === "A").id;
    let o = await provisionAccount(ids.newstu, "student", { roll_no: "E2E-01", class_id: c10a, dob: "2011-05-05", gender: "Female" }, true);
    check("TEST 3/8/9: approve student -> active", o.status === "active" && o.role === "student", JSON.stringify(o));
    o = await provisionAccount(ids.newpar, "parent", { child_ids: [ids.newstu] }, true); check("approve parent and link the new student", o.status === "active", JSON.stringify(o));
    const subj = (await supabase.from("subjects").select("id").eq("class_id", c10a).eq("name", "Science")).data[0];
    o = await provisionAccount(ids.newtch, "teacher", { employee_id: "E2E-T1", department: "Science", assignments: [{ class_id: c10a, subject_id: subj.id }] }, true); check("approve teacher with class + subject", o.status === "active", JSON.stringify(o));
    o = await rejectAccount(ids.newrej, "Duplicate registration"); check("TEST 7: reject with reason", o.status === "rejected");
    o = await provisionAccount(ids.newinc, "teacher", { department: "Art" }, false); check("approve-but-finish-later -> incomplete", o.status === "incomplete", JSON.stringify(o));
  },
  async approved_student() {
    const st = await state(); check("TEST 4/10: approved student is active with a student record", st.status === "active" && st.entity_ok === true && st.role === "student", JSON.stringify(st));
    const r = await supabase.from("students").select("id,roll_no,student_code");
    check("sees exactly their own record with a generated Student ID", r.data.length === 1 && /^STU-\d{4}-\d+$/.test(r.data[0].student_code), JSON.stringify(r.data));
  },
  async approved_parent() {
    const r = await supabase.from("students").select("id"); check("TEST 11: parent sees ONLY the linked child", r.data.length === 1 && r.data[0].id === ids.newstu, JSON.stringify(r.data));
  },
  async approved_teacher() {
    const r = await supabase.from("students").select("id"); check("TEST 12: teacher sees only the assigned class's students", r.data.length === 5, String(r.data?.length));
    const f = await supabase.from("fee_payments").select("id"); check("teacher cannot read fees", (f.data || []).length === 0);
  },
  async rejected_user() {
    const st = await state(); check("TEST 7: rejected user sees status + reason", st.status === "rejected" && /Duplicate/.test(st.rejection_reason));
    const r = await supabase.from("classes").select("id"); check("rejected user reads no data", (r.data || []).length === 0);
  },
  async incomplete_user() {
    const st = await state(); check("incomplete user is reported incomplete", st.status === "incomplete");
    const r = await supabase.from("classes").select("id"); check("incomplete user reads no data", (r.data || []).length === 0);
  },
  async admin_suspend() { const o = await suspendAccount(ids.newstu, "Test suspension"); check("TEST 8: suspend active user", o.status === "suspended"); },
  async suspended_user() {
    const st = await state(); check("suspended state + note reported", st.status === "suspended" && st.status_reason === "Test suspension");
    const r = await supabase.from("students").select("id"); check("suspended user has NO data access (database-enforced)", (r.data || []).length === 0);
  },
  async admin_reactivate_promote() {
    let o = await reactivateAccount(ids.newstu); check("TEST 15: reactivate -> active", o.status === "active");
    o = await promoteToAdmin(ids.newtch); check("admin promotes an active account to admin", o.role === "admin");
  },
  async student_promote_attempt() {
    const r = await supabase.rpc("admin_promote_to_admin", { p_user: ids.newstu }); check("student cannot promote self to admin", /not_allowed/.test(msg(r.error)), JSON.stringify(r.error));
  },
};
try { await phases[phase](); } catch (e) { out.push(`FAIL  ${phase} threw: ${msg(e)} ${JSON.stringify(e)}`); }
console.log(out.join("\n"));
