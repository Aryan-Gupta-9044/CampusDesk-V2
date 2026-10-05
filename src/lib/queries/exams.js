import { supabase } from "../supabaseClient";

export async function listExamsForClass(classId) {
  const { data, error } = await supabase
    .from("exams")
    .select("id, name, term, start_date, end_date, class_id")
    .eq("class_id", classId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listExamsForTeacher(teacherId) {
  const { data: assignments, error: assignError } = await supabase
    .from("teacher_subjects")
    .select("class_id")
    .eq("teacher_id", teacherId);
  if (assignError) throw assignError;
  const classIds = [...new Set((assignments || []).map((a) => a.class_id))];
  if (classIds.length === 0) return [];

  const { data, error } = await supabase
    .from("exams")
    .select("id, name, term, start_date, end_date, class_id, classes ( name, section )")
    .in("class_id", classIds)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createExam({ name, classId, term, startDate, endDate }) {
  const { error } = await supabase
    .from("exams")
    .insert({ name, class_id: classId, term, start_date: startDate || null, end_date: endDate || null });
  if (error) throw error;
}

export async function deleteExam(id) {
  const { error } = await supabase.from("exams").delete().eq("id", id);
  if (error) throw error;
}

export async function listMySubjectsForClass(teacherId, classId) {
  const { data, error } = await supabase
    .from("teacher_subjects")
    .select("subject_id, subjects ( name )")
    .eq("teacher_id", teacherId)
    .eq("class_id", classId);
  if (error) throw error;
  return data;
}

export async function listMarksRoster(examId, classId, subjectId) {
  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id, roll_no, profiles!students_id_fkey ( full_name )")
    .eq("class_id", classId)
    .order("roll_no");
  if (studentsError) throw studentsError;

  const { data: marksRows, error: marksError } = await supabase
    .from("marks")
    .select("id, student_id, marks_obtained, max_marks")
    .eq("exam_id", examId)
    .eq("subject_id", subjectId);
  if (marksError) throw marksError;

  const marksByStudent = Object.fromEntries((marksRows || []).map((m) => [m.student_id, m]));

  return students.map((s) => ({
    ...s,
    marksObtained: marksByStudent[s.id]?.marks_obtained ?? "",
    maxMarks: marksByStudent[s.id]?.max_marks ?? 100,
  }));
}

export async function saveMarks(examId, subjectId, records, enteredBy) {
  const rows = records
    .filter((r) => r.marksObtained !== "" && r.marksObtained !== null)
    .map((r) => ({
      student_id: r.id,
      exam_id: examId,
      subject_id: subjectId,
      marks_obtained: Number(r.marksObtained),
      max_marks: Number(r.maxMarks) || 100,
      entered_by: enteredBy,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("marks").upsert(rows, { onConflict: "student_id,exam_id,subject_id" });
  if (error) throw error;
}

// Grades and ranks are computed in the database (grade_for / publish_exam_results) so every screen agrees.
export async function getExamResultStatus(examId) {
  const { data, error } = await supabase.rpc("exam_result_status", { p_exam: examId });
  if (error) throw error;
  return data; // { students, evaluated, incomplete, average, highest, lowest, published, expected_subjects }
}

export async function publishExamResults(examId, allowIncomplete = false) {
  const { data, error } = await supabase.rpc("publish_exam_results", { p_exam: examId, p_allow_incomplete: allowIncomplete });
  if (error) throw error;
  return data;
}

export async function unpublishExamResults(examId) {
  const { error } = await supabase.rpc("unpublish_exam_results", { p_exam: examId });
  if (error) throw error;
}

export async function listResultsForExam(examId) {
  const { data, error } = await supabase
    .from("results")
    .select("id, total_marks, percentage, grade, rank, published, students ( roll_no, profiles!students_id_fkey ( full_name ) )")
    .eq("exam_id", examId)
    .order("rank");
  if (error) throw error;
  return data;
}

export async function listMyResults(studentId) {
  const { data, error } = await supabase
    .from("results")
    .select("id, total_marks, percentage, grade, rank, exams ( name, term ) ")
    .eq("student_id", studentId)
    .eq("published", true)
    .order("id", { ascending: false });
  if (error) throw error;
  return data;
}
