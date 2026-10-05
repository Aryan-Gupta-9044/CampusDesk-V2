import { supabase } from "../supabaseClient";

export async function logAction(actorId, action, targetTable, targetId, details) {
  // Best-effort — a failed audit write should never block the actual operation.
  try {
    await supabase.from("audit_logs").insert({
      actor_id: actorId,
      action,
      target_table: targetTable,
      target_id: targetId || null,
      details: details || null,
    });
  } catch (err) {
    console.error("Audit log write failed:", err.message);
  }
}

export async function listAuditLogs(limit = 200) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, target_table, target_id, details, created_at, profiles ( full_name, email )")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
