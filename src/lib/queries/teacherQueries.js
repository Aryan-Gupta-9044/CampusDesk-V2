import { supabase } from "../supabaseClient";

export async function listTeachersForClass(classId) {
  const { data, error } = await supabase
    .from("teacher_subjects")
    .select("teacher_id, teachers ( id, profiles ( full_name ) ), subjects ( name )")
    .eq("class_id", classId);
  if (error) throw error;
  // De-duplicate by teacher (a teacher may teach multiple subjects in the class)
  const seen = new Map();
  (data || []).forEach((row) => {
    if (!seen.has(row.teacher_id)) {
      seen.set(row.teacher_id, { id: row.teacher_id, name: row.teachers?.profiles?.full_name, subjects: [row.subjects?.name] });
    } else {
      seen.get(row.teacher_id).subjects.push(row.subjects?.name);
    }
  });
  return Array.from(seen.values());
}

export async function createQuery({ studentId, senderId, senderRole, teacherId, queryType, message }) {
  const { error } = await supabase.from("teacher_queries").insert({
    student_id: studentId,
    sender_id: senderId,
    sender_role: senderRole,
    teacher_id: teacherId,
    query_type: queryType,
    message,
  });
  if (error) throw error;
}

export async function listMySentQueries(senderId) {
  const { data, error } = await supabase
    .from("teacher_queries")
    .select("id, query_type, message, reply, status, created_at, replied_at, teachers ( profiles ( full_name ) )")
    .eq("sender_id", senderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listQueriesForTeacher(teacherId) {
  const { data, error } = await supabase
    .from("teacher_queries")
    .select("id, query_type, message, reply, status, created_at, sender_role, students ( profiles!students_id_fkey ( full_name ) )")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function replyToQuery(id, reply) {
  const { error } = await supabase
    .from("teacher_queries")
    .update({ reply, status: "answered", replied_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
