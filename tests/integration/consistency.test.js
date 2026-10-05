// Integration check (needs a seeded fresh DB behind PostgREST; see docs/TESTING.md).
// Verifies the same student shows the SAME attendance % and fee numbers on every screen's data path.
import { getStudentDashboardData } from "../../src/lib/services/studentData";
import { getStudentReport } from "../../src/lib/services/report";
import { getFeeLines } from "../../src/lib/services/fees";
import { getAttendanceCounts } from "../../src/lib/queries/attendance";
import { getAdminDashboardData } from "../../src/lib/services/adminData";
import { getTeacherDashboardData } from "../../src/lib/services/teacherData";
import { pctFromCounts, summarizeFeeLines } from "../../src/lib/metrics";

const who = process.env.WHO;
const id = JSON.parse(Buffer.from(process.env.VITE_SUPABASE_ANON_KEY.split(".")[1], "base64").toString()).sub;
const out = { who };
const rawPct = JSON.parse(process.env.RAW_PCT || "{}");
const rawFee = JSON.parse(process.env.RAW_FEE || "{}");
try {
  if (who === "student" || who === "parent") {
    const sid = process.env.SID || id;
    const dash = await getStudentDashboardData(sid, id);
    const report = await getStudentReport(sid);
    const counts = await getAttendanceCounts(sid);
    const lines = summarizeFeeLines(await getFeeLines(sid));
    out.attendance = { dashboard: dash.attendance.percent, report: report.overall.pct, attendancePage: pctFromCounts(counts), sql: rawPct[sid] };
    out.fees = { dashboard: [dash.fees.total, dash.fees.paid, dash.fees.pending, dash.fees.due], feesPage: [lines.total, lines.paid, lines.pending, lines.due], sql: rawFee[sid] };
    out.report = { code: report.student.student_code, classTeacher: report.class_teacher?.name, guardian: report.guardian?.name, attRows: report.attendance.length, marks: report.marks.length };
  } else if (who === "admin") {
    const d = await getAdminDashboardData();
    out.adminPerClass = d.perClass.map((c) => [c.label, c.attendancePct]);
    out.health = d.health.map((h) => `${h.label}=${h.count}`);
    out.kpis = d.kpis;
  } else if (who === "teacher") {
    const d = await getTeacherDashboardData(id);
    out.teacherPerAssignment = d.analytics.classPerformance.map((c) => [c.label, c.attendancePct]);
  }
} catch (e) { out.ERROR = { message: e?.message, code: e?.code, details: e?.details }; }
console.log(JSON.stringify(out));
