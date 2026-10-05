import { supabase } from "../supabaseClient";

export async function listMyLeaveRequests(userId) {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, from_date, to_date, reason, status, created_at")
    .eq("requester_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createLeaveRequest({ fromDate, toDate, reason }, requesterId, requesterRole) {
  const { error } = await supabase.from("leave_requests").insert({
    requester_id: requesterId,
    requester_role: requesterRole,
    from_date: fromDate,
    to_date: toDate,
    reason,
  });
  if (error) throw error;
}

export async function listPendingStudentLeaveForTeacher() {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, from_date, to_date, reason, status, created_at, requester_id, profiles!leave_requests_requester_id_fkey ( full_name )")
    .eq("requester_role", "student")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listAllLeaveRequestsForAdmin() {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, from_date, to_date, reason, status, requester_role, created_at, requester_id, profiles!leave_requests_requester_id_fkey ( full_name )")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function setLeaveStatus(id, status, approvedBy) {
  const { error } = await supabase.from("leave_requests").update({ status, approved_by: approvedBy }).eq("id", id);
  if (error) throw error;
}
