import { createAccountViaEdge, useEdgeFunctions } from "../services/createUser";
import { provisionIfAvailable } from "../services/accounts";
import { supabase } from "../supabaseClient";
import { getAdminActionClient } from "../adminActionClient";

export async function listStudents() {
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, roll_no, dob, gender, address, admission_date, class_id, classes ( name, section ), profiles!students_id_fkey ( full_name, email, status )"
    )
    .order("roll_no");
  if (error) throw error;
  return data;
}

export async function getStudent(id) {
  const { data, error } = await supabase
    .from("students")
    .select("id, roll_no, dob, gender, address, admission_date, class_id, parent_id, classes ( name, section )")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

// Only for the Admin Student Detail page — embeds the linked parent's
// profile too. Kept separate from getStudent() above because a
// non-admin caller (student viewing their own fees/analytics) has no
// RLS permission to read someone else's profile row, and PostgREST
// collapses the whole result to zero rows in that case rather than
// just leaving the field blank — throwing "Cannot coerce the result
// to a single JSON object". Admin bypasses RLS entirely, so this is
// safe to use there regardless of whether profiles_rls_patch.sql has
// been applied yet.
export async function getStudentWithParent(id) {
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, roll_no, dob, gender, address, admission_date, class_id, parent_id, classes ( name, section ), profiles!students_id_fkey ( full_name, email, status ), parent:profiles!students_parent_id_fkey ( full_name, email )"
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createStudent({ fullName, email, password, rollNo, classId, dob, gender, address }) {
  const { data: signUpData, error: signUpError } = await getAdminActionClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role: "student" } },
  });
  if (signUpError) throw signUpError;

  const userId = signUpData.user.id;

  // Database with migration 008: provision atomically (new accounts are pending until provisioned)
  if (await provisionIfAvailable(userId, "student", { roll_no: rollNo, class_id: classId, dob, gender, address })) return userId;

  const { error: insertError } = await supabase.from("students").insert({
    id: userId,
    roll_no: rollNo || null,
    class_id: classId || null,
    dob: dob || null,
    gender: gender || null,
    address: address || null,
  });
  if (insertError) throw insertError;

  return userId;
}

export async function updateStudent(id, { fullName, rollNo, classId, dob, gender, address }) {
  const { error: profileError } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", id);
  if (profileError) throw profileError;

  const { error: studentError } = await supabase
    .from("students")
    .update({
      roll_no: rollNo || null,
      class_id: classId || null,
      dob: dob || null,
      gender: gender || null,
      address: address || null,
    })
    .eq("id", id);
  if (studentError) throw studentError;
}

export async function setStudentStatus(id, status) {
  const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function findParentByEmail(email) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("email", email)
    .eq("role", "parent")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setStudentParent(studentId, parentId) {
  const { error } = await supabase.from("students").update({ parent_id: parentId }).eq("id", studentId);
  if (error) throw error;
}

export async function createParentAndLink(studentId, { fullName, email, password }) {
  if (useEdgeFunctions()) {
    return createAccountViaEdge({ role: "parent", email, password, fullName, linkStudentId: studentId });
  }
  const { data: signUpData, error: signUpError } = await getAdminActionClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role: "parent" } },
  });
  if (signUpError) throw signUpError;

  if (await provisionIfAvailable(signUpData.user.id, "parent", { child_ids: [studentId] })) return signUpData.user.id;

  // Pre-008 database: the signed-in admin promotes the account to 'parent'.
  const { error: roleError } = await supabase.from("profiles").update({ role: "parent" }).eq("id", signUpData.user.id);
  if (roleError) throw roleError;

  await setStudentParent(studentId, signUpData.user.id);
  return signUpData.user.id;
}
