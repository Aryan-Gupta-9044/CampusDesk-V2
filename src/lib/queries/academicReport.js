import { supabase } from "../supabaseClient";
import { pctFromCounts } from "../metrics";

export async function getSubjectAttendanceBreakdown(studentId) {
  const { data, error } = await supabase
    .from("attendance")
    .select("status, subjects ( name )")
    .eq("student_id", studentId);
  if (error) throw error;

  const bySubject = {};
  (data || []).forEach((r) => {
    const name = r.subjects?.name || "Unassigned";
    if (!bySubject[name]) bySubject[name] = { total: 0, present: 0, absent: 0, late: 0 };
    bySubject[name].total += 1;
    if (r.status === "present") bySubject[name].present += 1;
    if (r.status === "absent") bySubject[name].absent += 1;
    if (r.status === "late") bySubject[name].late += 1;
  });

  return Object.entries(bySubject)
    .map(([subject, v]) => ({
      subject,
      ...v,
      percentage: pctFromCounts(v),
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

export async function getAllMarksBreakdown(studentId) {
  const { data, error } = await supabase
    .from("marks")
    .select("marks_obtained, max_marks, subjects ( name ), exams ( name, term ), teachers ( profiles ( full_name ) )")
    .eq("student_id", studentId);
  if (error) throw error;
  return (data || []).map((r) => ({
    subject: r.subjects?.name || "—",
    exam: r.exams?.name || "—",
    term: r.exams?.term || "",
    teacher: r.teachers?.profiles?.full_name || "—",
    marksObtained: r.marks_obtained,
    maxMarks: r.max_marks,
    percentage: r.max_marks ? Math.round((r.marks_obtained / r.max_marks) * 100) : 0,
  }));
}

export async function getTeacherSubjectBreakdown(teacherId) {
  const { data: assignments, error } = await supabase
    .from("teacher_subjects")
    .select("class_id, subject_id, classes ( name, section ), subjects ( name )")
    .eq("teacher_id", teacherId);
  if (error) throw error;

  const results = [];
  for (const a of assignments || []) {
    const { data: att } = await supabase
      .from("attendance")
      .select("status")
      .eq("class_id", a.class_id)
      .eq("subject_id", a.subject_id);
    const cnt = { present: 0, late: 0, absent: 0 };
    (att || []).forEach((r) => { if (r.status in cnt) cnt[r.status] += 1; });

    const { data: marksRows } = await supabase
      .from("marks")
      .select("marks_obtained, max_marks, exams ( name )")
      .eq("subject_id", a.subject_id);

    const byExam = {};
    (marksRows || []).forEach((m) => {
      const name = m.exams?.name || "—";
      if (!byExam[name]) byExam[name] = { total: 0, count: 0 };
      byExam[name].total += Number(m.marks_obtained) / Number(m.max_marks) * 100;
      byExam[name].count += 1;
    });
    const examBreakdown = Object.entries(byExam).map(([exam, v]) => ({
      exam,
      avgPercentage: v.count ? Math.round(v.total / v.count) : 0,
    }));

    results.push({
      label: `${a.classes?.name}-${a.classes?.section} · ${a.subjects?.name}`,
      attendancePct: pctFromCounts(cnt),
      examBreakdown,
    });
  }
  return results;
}
