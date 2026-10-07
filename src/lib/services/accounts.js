import { supabase } from "../supabaseClient";

// All privileged account operations are database functions that re-check that the caller is an active admin.
// The browser only ever sends *requests*; the database decides.
async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export const getAccountCounts = () => rpc("admin_account_counts");

export async function listAccounts({ status, role, search, page = 0, pageSize = 25 } = {}) {
  const rows = await rpc("admin_list_accounts", {
    p_status: status || null, p_role: role || null, p_search: search?.trim() || null,
    p_limit: pageSize, p_offset: page * pageSize,
  });
  return { rows: rows || [], total: rows?.[0] ? Number(rows[0].total_count) : 0 };
}

export const getAccount = (userId) => rpc("admin_get_account", { p_user: userId });

/** Approve / provision. activate=false saves the details and marks the account "incomplete". */
export const provisionAccount = (userId, role, data, activate = true) =>
  rpc("admin_provision_account", { p_user: userId, p_role: role, p_data: data || {}, p_activate: activate });

export const rejectAccount = (userId, reason) => rpc("admin_reject_account", { p_user: userId, p_reason: reason || null });
export const suspendAccount = (userId, reason) => rpc("admin_suspend_account", { p_user: userId, p_reason: reason || null });
export const reactivateAccount = (userId) => rpc("admin_reactivate_account", { p_user: userId });
export const promoteToAdmin = (userId) => rpc("admin_promote_to_admin", { p_user: userId });

/**
 * Used by the legacy "add student / teacher / parent" forms: after the Auth user exists, provision it
 * through the same atomic database function. Returns false when migration 008 is not installed
 * (function missing) so the caller can fall back to the pre-008 steps.
 */
export async function provisionIfAvailable(userId, role, data) {
  const { error } = await supabase.rpc("admin_provision_account", { p_user: userId, p_role: role, p_data: data, p_activate: true });
  if (!error) return true;
  if (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message || "")) return false;
  throw error;
}

/** Lists for the provisioning form (admin-readable through existing RLS). */
export async function loadProvisioningLookups() {
  const [classes, subjects, parents, students] = await Promise.all([
    supabase.from("classes").select("id, name, section, academic_year, class_teacher_id").order("name").order("section"),
    supabase.from("subjects").select("id, name, class_id").order("name"),
    supabase.rpc("admin_list_accounts", { p_status: "active", p_role: "parent", p_search: null, p_limit: 200, p_offset: 0 }),
    supabase.from("students").select("id, roll_no, class_id, parent_id, profiles!students_id_fkey ( full_name ), classes ( name, section )").order("roll_no"),
  ]);
  for (const r of [classes, subjects, parents, students]) if (r.error) throw r.error;
  return { classes: classes.data || [], subjects: subjects.data || [], parents: parents.data || [], students: students.data || [] };
}
