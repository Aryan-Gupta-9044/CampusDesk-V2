import { createAccountViaEdge, useEdgeFunctions } from "../services/createUser";
import { provisionIfAvailable } from "../services/accounts";
import { supabase } from "../supabaseClient";
import { getAdminActionClient } from "../adminActionClient";

export async function listTeachers() {
  const { data, error } = await supabase
    .from("teachers")
    .select("id, employee_id, department, qualification, joining_date, profiles ( full_name, email, status )")
    .order("employee_id");
  if (error) throw error;
  return data;
}

export async function getTeacher(id) {
  const { data, error } = await supabase
    .from("teachers")
    .select("id, employee_id, department, qualification, joining_date, profiles ( full_name, email, status )")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createTeacher({ fullName, email, password, employeeId, department, qualification, joiningDate }) {
  if (useEdgeFunctions()) {
    return createAccountViaEdge({ role: "teacher", email, password, fullName, teacher: { employeeId, department, qualification, joiningDate } });
  }
  const { data: signUpData, error: signUpError } = await getAdminActionClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role: "teacher" } },
  });
  if (signUpError) throw signUpError;

  const userId = signUpData.user.id;

  if (await provisionIfAvailable(userId, "teacher", { employee_id: employeeId, department, qualification, joining_date: joiningDate })) return userId;

  // Pre-008 database: the signed-in admin promotes to 'teacher'.
  const { error: roleError } = await supabase.from("profiles").update({ role: "teacher" }).eq("id", userId);
  if (roleError) throw roleError;

  const { error: insertError } = await supabase.from("teachers").insert({
    id: userId,
    employee_id: employeeId || null,
    department: department || null,
    qualification: qualification || null,
    joining_date: joiningDate || null,
  });
  if (insertError) throw insertError;

  return userId;
}

export async function updateTeacher(id, { fullName, employeeId, department, qualification, joiningDate }) {
  const { error: profileError } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", id);
  if (profileError) throw profileError;

  const { error: teacherError } = await supabase
    .from("teachers")
    .update({
      employee_id: employeeId || null,
      department: department || null,
      qualification: qualification || null,
      joining_date: joiningDate || null,
    })
    .eq("id", id);
  if (teacherError) throw teacherError;
}

export async function setTeacherStatus(id, status) {
  const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
  if (error) throw error;
}
