import { supabase } from "../supabaseClient";
import { addDays, todayISO } from "../dates";
import { mean, pctFromCounts } from "../metrics";

function unwrap({ data, error }) {
  if (error) throw error;
  return data || [];
}
const count = (q) => q.then(({ count: c, error }) => { if (error) throw error; return c || 0; });

export async function getAdminDashboardData() {
  const today = todayISO();

  const [studentCount, teacherCount, classes, students, attendance, results, structures, payments, pendingLeave, pendingPayments, audit, assignments, events] =
    await Promise.all([
      count(supabase.from("students").select("id", { count: "exact", head: true })),
      count(supabase.from("teachers").select("id", { count: "exact", head: true })),
      supabase.from("classes").select("id, name, section, class_teacher_id").order("name").order("section").then(unwrap),
      supabase.from("students").select("id, class_id").then(unwrap),
      supabase.rpc("attendance_summary_by_class").then(unwrap),   // aggregated in SQL, same policy as everywhere
      supabase.from("results").select("percentage, exams ( class_id )").eq("published", true).then(unwrap),
      supabase.from("fee_structure").select("id, class_id, amount").then(unwrap),
      supabase.from("fee_payments").select("amount_paid, status, fee_structure_id").then(unwrap),
      supabase.from("leave_requests")
        .select("id, from_date, to_date, requester_role, created_at, profiles!leave_requests_requester_id_fkey ( full_name )")
        .eq("status", "pending").order("created_at", { ascending: false }).limit(6).then(unwrap),
      supabase.from("fee_payments")
        .select("id, amount_paid, payment_date, students ( profiles!students_id_fkey ( full_name ) )")
        .eq("status", "pending_verification").limit(6).then(unwrap),
      supabase.from("audit_logs")
        .select("id, action, target_table, details, created_at, profiles!audit_logs_actor_id_fkey ( full_name, role )")
        .order("created_at", { ascending: false }).limit(8).then(unwrap),
      supabase.from("teacher_subjects").select("teacher_id, class_id").then(unwrap),
      supabase.from("events").select("id, title, event_date, start_time, event_type, location")
        .gte("event_date", today).order("event_date").limit(4).then(unwrap),
    ]);

  // ---- system health (cheap count queries) + incomplete marks on started exams
  const head = (q) => q.then(({ count: c, error }) => { if (error) throw error; return c || 0; });
  const [noParent, noClass, ttClasses, pendingPayCount, pendingLeaveCount, startedExams, upcomingExams] = await Promise.all([
    head(supabase.from("students").select("id", { count: "exact", head: true }).is("parent_id", null)),
    head(supabase.from("students").select("id", { count: "exact", head: true }).is("class_id", null)),
    supabase.from("timetable").select("class_id").limit(5000).then(unwrap),
    head(supabase.from("fee_payments").select("id", { count: "exact", head: true }).eq("status", "pending_verification")),
    head(supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    supabase.from("exams").select("id, name, classes ( name, section )").lte("start_date", today).order("start_date", { ascending: false }).limit(12).then(unwrap),
    head(supabase.from("exams").select("id", { count: "exact", head: true }).gt("start_date", today)),
  ]);
  const accountCounts = await supabase.rpc("admin_account_counts").then(({ data }) => data || null);   // null until migration 008 is installed
  const statuses = await Promise.all(startedExams.map((e) => supabase.rpc("exam_result_status", { p_exam: e.id }).then(({ data }) => ({ e, data }))));
  const incompleteExams = statuses.filter((x) => x.data && Number(x.data.incomplete) > 0);
  const withTimetable = new Set(ttClasses.map((t) => t.class_id));
  const health = [
    ...(accountCounts ? [{ key: "reg", label: "Registrations awaiting approval", count: Number(accountCounts.pending) || 0, to: "/account-requests" },
                         { key: "inc", label: "Approved accounts with incomplete setup", count: Number(accountCounts.incomplete) || 0, to: "/account-requests" }] : []),
    { key: "noparent", label: "Students without a parent linked", count: noParent, to: "/students" },
    { key: "noclass", label: "Students without a class", count: noClass, to: "/students" },
    { key: "noteacher", label: "Classes without a class teacher", count: classes.filter((c) => !c.class_teacher_id).length, to: "/classes" },
    { key: "nott", label: "Classes without a timetable", count: classes.filter((c) => !withTimetable.has(c.id)).length, to: "/timetable" },
    { key: "pay", label: "Payment requests awaiting verification", count: pendingPayCount, to: "/fees" },
    { key: "leave", label: "Leave requests awaiting a decision", count: pendingLeaveCount, to: "/leave" },
    { key: "marks", label: "Exams with incomplete marks", count: incompleteExams.length, to: "/exams",
      detail: incompleteExams.slice(0, 3).map((x) => `${x.e.classes?.name}-${x.e.classes?.section} ${x.e.name}`).join(", ") },
  ];

  const studentsByClass = {};
  students.forEach((s) => { studentsByClass[s.class_id] = (studentsByClass[s.class_id] || 0) + 1; });

  const perClass = classes.map((c) => {
    const att = attendance.filter((a) => a.class_id === c.id);
    const sum = (k) => att.reduce((a, r) => a + Number(r[k]), 0);
    const res = results.filter((r) => r.exams?.class_id === c.id);
    const classStructures = structures.filter((s) => s.class_id === c.id);
    const expected = classStructures.reduce((a, s) => a + Number(s.amount), 0) * (studentsByClass[c.id] || 0);
    const ids = new Set(classStructures.map((s) => s.id));
    const collected = payments
      .filter((p) => ids.has(p.fee_structure_id) && (p.status === "paid" || p.status === "partial"))
      .reduce((a, p) => a + Number(p.amount_paid || 0), 0);
    return {
      label: `${c.name}-${c.section}`,
      students: studentsByClass[c.id] || 0,
      teachers: new Set(assignments.filter((a) => a.class_id === c.id).map((a) => a.teacher_id)).size,
      attendancePct: pctFromCounts({ present: sum("present"), late: sum("late"), absent: sum("absent") }),
      avgScore: res.length ? Math.round(mean(res.map((r) => r.percentage))) : null,
      collected,
      outstanding: Math.max(0, expected - collected),
    };
  });

  const feesCollected = payments
    .filter((p) => p.status === "paid" || p.status === "partial")
    .reduce((a, p) => a + Number(p.amount_paid || 0), 0);

  function perClassOutstanding() { return perClass.reduce((a, c) => a + c.outstanding, 0); }

  return {
    accountCounts,
    health,
    kpis: {
      students: studentCount,
      teachers: teacherCount,
      classes: classes.length,
      attendancePct: pctFromCounts({
        present: attendance.reduce((a, r) => a + Number(r.present), 0),
        late: attendance.reduce((a, r) => a + Number(r.late), 0),
        absent: attendance.reduce((a, r) => a + Number(r.absent), 0),
      }),
      feesCollected,
      pendingLeave: pendingLeaveCount,
      pendingPayments: pendingPayCount,
      pendingFees: perClassOutstanding(),
      upcomingExams,
    },
    perClass,
    pendingLeave,
    pendingPayments,
    audit,
    events,
    hasAttendance: attendance.length > 0,
  };
}

const ACTION_TEXT = {
  account_registered: (d, who) => `${who} registered${d?.requested_role ? ` and requested a ${d.requested_role} account` : ""}`,
  account_approved: (d, who) => `${who} approved an account${d?.role ? ` as ${d.role}` : ""}`,
  account_rejected: (d, who) => `${who} rejected a registration`,
  account_suspended: (d, who) => `${who} suspended an account`,
  account_reactivated: (d, who) => `${who} reactivated an account`,
  role_assigned: (d, who) => `${who} assigned the ${d?.role || ""} role`,
  student_provisioned: (d, who) => `${who} provisioned a student record`,
  teacher_provisioned: (d, who) => `${who} provisioned a teacher record`,
  parent_linked: (d, who) => `${who} linked a parent to a student`,
  admin_promoted: (d, who) => `${who} promoted a user to administrator`,
  post_notice: (d, who) => `${who} posted a notice${d?.title ? `: ${d.title}` : ""}`,
  request_leave: (d, who) => `${who} submitted a leave request`,
  submit_fee_payment: (d, who) => `${who} submitted a fee payment${d?.amount ? ` of ₹${d.amount}` : ""}`,
  publish_results: (d, who) => `${who} published marks${d?.exam ? ` for ${d.exam}` : ""}`,
  create_exam: (d, who) => `${who} created an exam${d?.exam ? `: ${d.exam}` : ""}`,
  leave_approved: (d, who) => `${who} approved a leave request${d?.requester ? ` (${d.requester})` : ""}`,
  leave_rejected: (d, who) => `${who} rejected a leave request${d?.requester ? ` (${d.requester})` : ""}`,
  timetable_insert: (d, who) => `${who} added a timetable period`,
  timetable_update: (d, who) => `${who} updated the timetable`,
  timetable_delete: (d, who) => `${who} removed a timetable period`,
};

export function describeActivity(row) {
  const who = row.profiles?.full_name || "Someone";
  const fn = ACTION_TEXT[row.action];
  if (fn) return fn(row.details, who);
  return `${who}: ${String(row.action || "activity").replace(/_/g, " ")}`;
}
