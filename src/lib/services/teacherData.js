import { supabase } from "../supabaseClient";
import { addDays, istNow, timeToMinutes, todayISO } from "../dates";
import { attendancePct, markPct, mean, pctFromCounts, weeklyAttendanceTrend } from "../metrics";

function unwrap({ data, error }) {
  if (error) throw error;
  return data || [];
}

const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const classLabel = (c) => (c ? `${c.name}-${c.section}` : "");

export async function getTeacherProfile(teacherId) {
  const { data, error } = await supabase
    .from("teachers")
    .select("id, employee_id, department, qualification, profiles!teachers_id_fkey ( full_name, email, phone, avatar_url, status )")
    .eq("id", teacherId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listTeacherAssignments(teacherId) {
  return supabase
    .from("teacher_subjects")
    .select("id, class_id, subject_id, classes ( id, name, section ), subjects ( id, name )")
    .eq("teacher_id", teacherId)
    .then(unwrap);
}

/** One call that feeds the whole teacher dashboard. */
export async function getTeacherDashboardData(teacherId) {
  const now = istNow();
  const today = now.dateStr;
  const since = addDays(today, -28);

  const [teacher, assignments] = await Promise.all([getTeacherProfile(teacherId), listTeacherAssignments(teacherId)]);
  const classIds = uniq(assignments.map((a) => a.class_id));
  const subjectIds = uniq(assignments.map((a) => a.subject_id));
  const none = classIds.length === 0;

  const [todayTT, students, attendance, attSummary, marks, exams, openQueries, notices, events] = await Promise.all([
    supabase.from("timetable").select("id, class_id, subject_id, start_time, end_time, room, classes ( name, section ), subjects ( name )")
      .eq("teacher_id", teacherId).eq("day_of_week", now.dow).order("start_time").then(unwrap),
    none ? [] : supabase.from("students").select("id, class_id").in("class_id", classIds).then(unwrap),
    none ? [] : supabase.from("attendance").select("class_id, subject_id, date, status")
      .in("class_id", classIds).gte("date", since).limit(5000).then(unwrap),     // recent rows: trend + "marked today"
    none ? [] : supabase.rpc("attendance_summary_by_class").then(unwrap),          // all-time counts: headline percentages
    none ? [] : supabase.from("marks").select("student_id, exam_id, subject_id, marks_obtained, max_marks")
      .in("subject_id", subjectIds).limit(5000).then(unwrap),
    none ? [] : supabase.from("exams").select("id, name, class_id, start_date").in("class_id", classIds).then(unwrap),
    supabase.from("teacher_queries").select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId).eq("status", "open").then(({ count, error }) => { if (error) throw error; return count || 0; }),
    supabase.from("notices").select("id, title, content, created_at, pinned").order("created_at", { ascending: false }).limit(4).then(unwrap),
    supabase.from("events").select("id, title, description, event_date, start_time, event_type, location")
      .gte("event_date", today).order("event_date").order("start_time").limit(4).then(unwrap),
  ]);

  const studentsByClass = {};
  students.forEach((s) => { studentsByClass[s.class_id] = (studentsByClass[s.class_id] || 0) + 1; });
  const classOf = Object.fromEntries(students.map((s) => [s.id, s.class_id]));

  // ---- today's classes with live status
  const todaysClasses = todayTT.map((e) => {
    const start = timeToMinutes(e.start_time);
    const end = timeToMinutes(e.end_time);
    const marked = attendance.some((a) => a.date === today && a.class_id === e.class_id && a.subject_id === e.subject_id);
    let status = "upcoming";
    if (now.minutes >= start) {
      if (marked) status = now.minutes < end ? "in_progress" : "completed";
      else status = "attendance_pending";
    }
    return {
      ...e,
      label: classLabel(e.classes),
      studentCount: studentsByClass[e.class_id] || 0,
      isCurrent: now.minutes >= start && now.minutes < end,
      status,
    };
  });

  // ---- pending marks: started exams where some students have no mark for my subject
  const pendingMarks = [];
  exams.filter((x) => x.start_date && x.start_date <= today).forEach((exam) => {
    assignments.filter((a) => a.class_id === exam.class_id).forEach((a) => {
      const expected = studentsByClass[a.class_id] || 0;
      const have = new Set(marks.filter((m) => m.exam_id === exam.id && m.subject_id === a.subject_id).map((m) => m.student_id)).size;
      if (expected - have > 0) {
        pendingMarks.push({
          exam: exam.name, label: `${classLabel(a.classes)} ${a.subjects?.name}`, missing: expected - have,
        });
      }
    });
  });

  // ---- analytics per assignment
  const perAssignment = assignments.map((a) => {
    const counts = attSummary.filter((r) => r.class_id === a.class_id && r.subject_id === a.subject_id)
      .reduce((acc, r) => ({ present: acc.present + Number(r.present), late: acc.late + Number(r.late), absent: acc.absent + Number(r.absent) }), { present: 0, late: 0, absent: 0 });
    const att = attendance.filter((r) => r.class_id === a.class_id && r.subject_id === a.subject_id);
    const mk = marks.filter((m) => m.subject_id === a.subject_id && classOf[m.student_id] === a.class_id);
    return {
      label: `${classLabel(a.classes)} · ${a.subjects?.name}`,
      shortLabel: classLabel(a.classes),
      subject: a.subjects?.name,
      attendancePct: pctFromCounts(counts),
      avgMarksPct: mk.length ? Math.round(mean(mk.map(markPct))) : null,
      attRows: att,
    };
  });

  const allAtt = perAssignment.flatMap((p) => p.attRows);
  const attendanceTrend = weeklyAttendanceTrend(allAtt, 4);

  const examName = Object.fromEntries(exams.map((e) => [e.id, e]));
  const byExam = {};
  marks.forEach((m) => {
    const e = examName[m.exam_id];
    if (!e) return;
    (byExam[e.name] = byExam[e.name] || { date: e.start_date, values: [] }).values.push(markPct(m));
  });
  const examPerformance = Object.entries(byExam)
    .map(([exam, v]) => ({ exam, date: v.date, avg: Math.round(mean(v.values)) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const pendingAttendance = todaysClasses.filter((c) => c.status === "attendance_pending").length;

  return {
    teacher,
    assignments,
    todaysClasses,
    kpis: {
      classesToday: todaysClasses.length,
      studentsToday: uniq(todaysClasses.map((c) => c.class_id)).reduce((a, id) => a + (studentsByClass[id] || 0), 0),
      pendingAttendance,
      pendingMarks: pendingMarks.length,
      openQueries,
    },
    pendingMarks,
    analytics: {
      classPerformance: perAssignment.map(({ attRows, ...rest }) => rest),
      attendanceTrend,
      examPerformance,
    },
    notices,
    events,
  };
}
