import { supabase } from "../supabaseClient";
import { addDays, daysUntil, istNow, todayISO } from "../dates";
import {
  attendancePct, groupAttendanceBySubject, markPct, mean, summarizeFeeLines, weeklyAttendanceTrend,
} from "../metrics";
import { getFeeLines } from "./fees";
import { buildStudentActions } from "../actions";
import { listTimetableForClass } from "../queries/timetable";

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export async function getStudentProfile(studentId) {
  const { data, error } = await supabase
    .from("students")
    .select("id, roll_no, class_id, parent_id, classes ( id, name, section ), profiles!students_id_fkey ( full_name, email, phone, avatar_url, status )")
    .eq("id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Today's periods (IST) for a list of timetable rows, sorted, with live state. */
export function todaysEntries(entries, now = istNow()) {
  return (entries || [])
    .filter((e) => e.day_of_week === now.dow)
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
}

/**
 * Class-average aggregates come from a security-definer function that returns
 * only averages (never other students' names or scores).
 */
async function loadClassAverages(classId) {
  if (!classId) return [];
  const { data, error } = await supabase.rpc("class_exam_averages", { p_class: classId });
  if (error) {
    if (import.meta.env.DEV) console.warn("[CampusDesk] class_exam_averages unavailable:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Everything the Student / Parent overview needs, in one parallel round-trip.
 * `requesterId` is whoever is logged in (student or parent) - used for leave.
 */
export async function getStudentDashboardData(studentId, requesterId) {
  const today = todayISO();
  const student = await getStudentProfile(studentId);
  if (!student) return { student: null };
  const classId = student.class_id;

  const [timetable, attendance, marks, results, classAvgs, notices, events, exams, feeLines, leave] =
    await Promise.all([
      classId ? listTimetableForClass(classId) : [],
      supabase.from("attendance").select("date, status, subject_id, subjects ( name )")
        .eq("student_id", studentId).order("date", { ascending: false }).limit(5000).then(unwrap),
      supabase.from("marks").select("marks_obtained, max_marks, exam_id, subject_id, exams ( name, start_date ), subjects ( name )")
        .eq("student_id", studentId).then(unwrap),
      supabase.from("results").select("percentage, grade, rank, exam_id, exams ( name, start_date )")
        .eq("student_id", studentId).eq("published", true).then(unwrap),
      loadClassAverages(classId),
      supabase.from("notices").select("id, title, content, created_at, pinned")
        .order("created_at", { ascending: false }).limit(5).then(unwrap),
      supabase.from("events").select("id, title, description, event_date, start_time, event_type, location")
        .gte("event_date", today).order("event_date").order("start_time").limit(6).then(unwrap),
      classId
        ? supabase.from("exams").select("id, name, start_date, end_date").eq("class_id", classId)
            .gte("start_date", today).order("start_date").limit(3).then(unwrap)
        : [],
      getFeeLines(studentId),
      requesterId
        ? supabase.from("leave_requests").select("id", { count: "exact", head: true })
            .eq("requester_id", requesterId).eq("status", "pending").then(({ count, error }) => { if (error) throw error; return count || 0; })
        : 0,
    ]);

  // ---- attendance
  const attendancePercent = attendancePct(attendance);
  const trend = weeklyAttendanceTrend(attendance, 4);
  const withData = trend.filter((t) => t.pct != null);
  const trendDelta = withData.length >= 2 ? withData[withData.length - 1].pct - withData[withData.length - 2].pct : null;
  const subjectAttendance = groupAttendanceBySubject(attendance);
  const lowestAttendance = subjectAttendance.filter((s) => s.pct != null).sort((a, b) => a.pct - b.pct)[0] || null;

  // ---- performance
  const examList = [...new Map(results.map((r) => [r.exam_id, r.exams])).entries()]
    .map(([id, e]) => ({ id, name: e?.name, date: e?.start_date }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const averageScore = results.length ? Math.round(mean(results.map((r) => r.percentage))) : null;

  const bySubject = {};
  marks.forEach((m) => {
    const name = m.subjects?.name || "Other";
    (bySubject[name] = bySubject[name] || []).push(markPct(m));
  });
  const subjectScores = Object.entries(bySubject)
    .map(([name, v]) => ({ name, score: Math.round(mean(v)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const lowestSubject = [...subjectScores].sort((a, b) => a.score - b.score)[0] || null;

  const classAvgByExam = {};
  classAvgs.forEach((a) => { (classAvgByExam[a.exam_id] = classAvgByExam[a.exam_id] || []).push(Number(a.avg_pct)); });
  const examSeries = examList.map((e) => ({
    exam: e.name,
    student: results.find((r) => r.exam_id === e.id) ? Math.round(Number(results.find((r) => r.exam_id === e.id).percentage)) : null,
    classAverage: classAvgByExam[e.id] ? Math.round(mean(classAvgByExam[e.id])) : null,
  }));

  const latestExam = examList[examList.length - 1];
  const subjectVsClass = latestExam
    ? subjectScores.map((s) => {
        const mine = marks.find((m) => m.exam_id === latestExam.id && (m.subjects?.name || "Other") === s.name);
        const avg = classAvgs.find((a) => a.exam_id === latestExam.id && a.subject_name === s.name);
        return {
          subject: s.name,
          student: mine ? Math.round(markPct(mine)) : null,
          classAverage: avg ? Math.round(Number(avg.avg_pct)) : null,
        };
      })
    : [];

  // ---- fees
  const fees = summarizeFeeLines(feeLines);
  const nextExam = exams[0] ? { ...exams[0], inDays: daysUntil(exams[0].start_date) } : null;

  const nextExamObj = exams[0] ? { ...exams[0], inDays: daysUntil(exams[0].start_date) } : null;
  const actions = buildStudentActions({ attendancePercent, feeLines, nextExam: nextExamObj, pendingLeave: leave });

  return {
    actions,
    student,
    timetable,
    attendance: { percent: attendancePercent, trend, trendDelta, subjects: subjectAttendance, lowest: lowestAttendance, total: attendance.length },
    performance: { average: averageScore, subjectScores, lowestSubject, examSeries, subjectVsClass, latestExamName: latestExam?.name || null, hasClassAverage: examSeries.some((e) => e.classAverage != null) },
    fees,
    notices,
    events,
    upcomingExams: exams.map((e) => ({ ...e, inDays: daysUntil(e.start_date) })),
    nextExam,
    pendingTasks: fees.unpaidCount + leave,
    pendingBreakdown: { fees: fees.unpaidCount, leave },
    today,
  };
}

export { addDays };
