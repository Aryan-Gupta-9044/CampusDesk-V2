import { supabase } from "../supabaseClient";

export async function listClasses() {
  const { data, error } = await supabase
    .from("classes")
    .select("id, name, section, academic_year, class_teacher_id, teachers ( id, profiles ( full_name ) )")
    .order("name")
    .order("section");
  if (error) throw error;
  return data;
}

export async function addClass({ name, section, academicYear, classTeacherId }) {
  const { error } = await supabase.from("classes").insert({
    name,
    section,
    academic_year: academicYear,
    class_teacher_id: classTeacherId || null,
  });
  if (error) throw error;
}

export async function updateClass(id, { name, section, academicYear, classTeacherId }) {
  const { error } = await supabase
    .from("classes")
    .update({ name, section, academic_year: academicYear, class_teacher_id: classTeacherId || null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteClass(id) {
  const { error } = await supabase.from("classes").delete().eq("id", id);
  if (error) throw error;
}

export async function listSubjects(classId) {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, code, class_id")
    .eq("class_id", classId)
    .order("name");
  if (error) throw error;
  return data;
}

export async function addSubject(classId, { name, code }) {
  const { error } = await supabase.from("subjects").insert({ class_id: classId, name, code });
  if (error) throw error;
}

export async function updateSubject(id, { name, code }) {
  const { error } = await supabase.from("subjects").update({ name, code }).eq("id", id);
  if (error) throw error;
}

export async function deleteSubject(id) {
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) throw error;
}

export async function listActiveTeachersForDropdown() {
  const { data, error } = await supabase
    .from("teachers")
    .select("id, profiles ( full_name, status )")
    .order("id");
  if (error) throw error;
  return (data || []).filter((t) => t.profiles?.status === "active");
}

export async function listSubjectTeachers(subjectId) {
  const { data, error } = await supabase
    .from("teacher_subjects")
    .select("id, teacher_id, teachers ( id, profiles ( full_name ) )")
    .eq("subject_id", subjectId);
  if (error) throw error;
  return data;
}

export async function assignTeacherToSubject(subjectId, classId, teacherId) {
  const { error } = await supabase
    .from("teacher_subjects")
    .insert({ subject_id: subjectId, class_id: classId, teacher_id: teacherId });
  if (error) throw error;
}

export async function unassignTeacherFromSubject(teacherSubjectId) {
  const { error } = await supabase.from("teacher_subjects").delete().eq("id", teacherSubjectId);
  if (error) throw error;
}
