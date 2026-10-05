import { supabase } from "../supabaseClient";

export async function listFeeStructures() {
  const { data, error } = await supabase
    .from("fee_structure")
    .select("id, class_id, academic_year, fee_type, amount, due_date, classes ( name, section )")
    .order("due_date");
  if (error) throw error;
  return data;
}

export async function addFeeStructure({ classId, academicYear, feeType, amount, dueDate }) {
  const { error } = await supabase.from("fee_structure").insert({
    class_id: classId,
    academic_year: academicYear,
    fee_type: feeType,
    amount,
    due_date: dueDate || null,
  });
  if (error) throw error;
}

export async function deleteFeeStructure(id) {
  const { error } = await supabase.from("fee_structure").delete().eq("id", id);
  if (error) throw error;
}

export async function listStudentsForClass(classId) {
  const { data, error } = await supabase
    .from("students")
    .select("id, roll_no, profiles!students_id_fkey ( full_name )")
    .eq("class_id", classId)
    .order("roll_no");
  if (error) throw error;
  return data;
}
