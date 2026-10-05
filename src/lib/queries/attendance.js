import { supabase } from "../supabaseClient";

export async function listMyTeachingAssignments(teacherId) {
  const { data, error } = await supabase
    .from("teacher_subjects")
    .select("id, class_id, subject_id, classes ( name, section ), subjects ( name )")
    .eq("teacher_id", teacherId);
  if (error) throw error;
  return data;
}

export async function listClassRosterWithAttendance(classId, subjectId, date) {
  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id, roll_no, profiles!students_id_fkey ( full_name )")
    .eq("class_id", classId)
    .order("roll_no");
  if (studentsError) throw studentsError;

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from("attendance")
    .select("id, student_id, status")
    .eq("class_id", classId)
    .eq("subject_id", subjectId)
    .eq("date", date);
  if (attendanceError) throw attendanceError;

  const statusByStudent = Object.fromEntries((attendanceRows || []).map((row) => [row.student_id, row.status]));

  return students.map((s) => ({
    ...s,
    status: statusByStudent[s.id] || "present",
  }));
}

// Atomic roster save (database function): validates the teacher is assigned to this class+subject,
// refuses future dates, and updates existing rows instead of creating duplicates.
export async function saveAttendance(classId, subjectId, date, records) {
  const { data, error } = await supabase.rpc("save_attendance", {
    p_class: classId, p_subject: subjectId, p_date: date,
    p_rows: records.map((r) => ({ student_id: r.id, status: r.status })),
  });
  if (error) throw error;
  return data; // { inserted, updated }
}

// All-time counts for one student, used for the headline % (same policy as every dashboard / the report).
export async function getAttendanceCounts(studentId) {
  const statuses = ["present", "late", "absent", "leave"];
  const results = await Promise.all(statuses.map((st) =>
    supabase.from("attendance").select("id", { count: "exact", head: true }).eq("student_id", studentId).eq("status", st)));
  const out = {};
  results.forEach((r, i) => { if (r.error) throw r.error; out[statuses[i]] = r.count || 0; });
  return out;
}

export async function listMyAttendanceHistory(studentId) {
  const { data, error } = await supabase
    .from("attendance")
    .select("id, date, status, subjects ( name )")
    .eq("student_id", studentId)
    .order("date", { ascending: false })
    .limit(60);
  if (error) throw error;
  return data;
}

export async function listAttendanceForClassAdmin(classId, date) {
  let query = supabase
    .from("attendance")
    .select("id, date, status, subjects ( name ), students ( roll_no, profiles!students_id_fkey ( full_name ) )")
    .order("date", { ascending: false })
    .limit(100);
  if (classId) query = query.eq("class_id", classId);
  if (date) query = query.eq("date", date);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
