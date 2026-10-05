import { supabase } from "./supabaseClient";

export async function generateRollNo(classId, className, section) {
  const { count, error } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId);
  if (error) throw error;
  const seq = (count || 0) + 1;
  return `${className}${section}-${String(seq).padStart(3, "0")}`;
}

export async function generateEmployeeId() {
  const { count, error } = await supabase.from("teachers").select("id", { count: "exact", head: true });
  if (error) throw error;
  return `EMP-${String((count || 0) + 1).padStart(3, "0")}`;
}

export async function generateReceiptNo() {
  const { count, error } = await supabase.from("fee_payments").select("id", { count: "exact", head: true });
  if (error) throw error;
  return `RCPT-${String((count || 0) + 1).padStart(4, "0")}`;
}
