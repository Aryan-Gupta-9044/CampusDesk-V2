import { supabase } from "../supabaseClient";

export async function listNotices() {
  const { data, error } = await supabase
    .from("notices")
    .select("id, title, content, target_role, target_class_id, pinned, expiry_date, created_at, classes ( name, section )")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createNotice({ title, content, targetRole, targetClassId, pinned, expiryDate }) {
  const { error } = await supabase.from("notices").insert({
    title,
    content,
    target_role: targetRole || "all",
    target_class_id: targetClassId || null,
    pinned: !!pinned,
    expiry_date: expiryDate || null,
  });
  if (error) throw error;
}

export async function deleteNotice(id) {
  const { error } = await supabase.from("notices").delete().eq("id", id);
  if (error) throw error;
}
