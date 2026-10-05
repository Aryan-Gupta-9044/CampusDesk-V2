import { supabase } from "../supabaseClient";
import { pctFromCounts } from "../metrics";

export async function getStudentReport(studentId) {
  const { data, error } = await supabase.rpc("get_student_report", { p_student: studentId });
  if (error) throw error;
  return deriveReport(data);
}

const round = (n) => (n == null || Number.isNaN(n) ? null : Math.round(n));

/** Adds the numbers the report prints. Attendance uses the shared policy (metrics.pctFromCounts). */
export function deriveReport(raw) {
  const attendance = (raw.attendance || []).map((r) => ({
    ...r,
    total: r.present + r.late + r.absent + r.leave,
    pct: pctFromCounts(r),
  }));
  const sum = (k) => attendance.reduce((a, r) => a + r[k], 0);
  const overall = { present: sum("present"), late: sum("late"), absent: sum("absent"), leave: sum("leave") };
  overall.total = overall.present + overall.late + overall.absent + overall.leave;
  overall.pct = pctFromCounts(overall);

  const marks = (raw.marks || []).map((m) => ({ ...m, percentage: m.percentage == null ? null : Number(m.percentage) }));
  const bySubject = {};
  marks.forEach((m) => { (bySubject[m.subject] = bySubject[m.subject] || []).push(m.percentage); });
  const subjectAverages = Object.entries(bySubject)
    .map(([subject, v]) => ({ subject, avg: round(v.reduce((a, b) => a + b, 0) / v.length) }))
    .sort((a, b) => b.avg - a.avg);

  const byExam = {};
  marks.forEach((m) => { (byExam[m.exam] = byExam[m.exam] || { exam: m.exam, date: m.exam_date, rows: [] }).rows.push(m); });
  const exams = Object.values(byExam).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const allPct = marks.map((m) => m.percentage).filter((v) => v != null);
  const averageScore = allPct.length ? round(allPct.reduce((a, b) => a + b, 0) / allPct.length) : null;

  return {
    ...raw, attendance, overall, marks, exams, subjectAverages, averageScore,
    best: subjectAverages[0] || null,
    needsAttention: subjectAverages.length > 1 ? subjectAverages[subjectAverages.length - 1] : null,
  };
}
