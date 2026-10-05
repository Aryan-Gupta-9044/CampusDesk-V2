import { supabase } from "../supabaseClient";

// A parent can have several children. ChildContext keeps this in sync with the
// child chosen in the navbar so every legacy page (attendance, results, fees...)
// shows the selected child without further changes.
let selectedChildId = null;
export function setSelectedChild(id) {
  selectedChildId = id || null;
}

export async function listChildren(parentUserId) {
  const { data, error } = await supabase
    .from("students")
    .select("id, roll_no, class_id, classes ( id, name, section ), profiles!students_id_fkey ( full_name )")
    .eq("parent_id", parentUserId)
    .order("roll_no");
  if (error) throw error;
  return data || [];
}

export async function getStudentIdForParent(parentUserId) {
  if (selectedChildId) return selectedChildId;
  const kids = await listChildren(parentUserId);
  return kids[0]?.id || null;
}
