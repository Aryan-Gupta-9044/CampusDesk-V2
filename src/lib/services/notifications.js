import { supabase } from "../supabaseClient";

export async function listNotifications(limit = 30) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId) {
  const { error } = await supabase
    .from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
  if (error) throw error;
}
