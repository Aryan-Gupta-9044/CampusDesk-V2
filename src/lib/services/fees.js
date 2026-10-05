import { supabase } from "../supabaseClient";

/** Per-fee lines (confirmed paid / pending / remaining / status / can_pay) from the database. */
export async function getFeeLines(studentId) {
  const { data, error } = await supabase.rpc("get_fee_summary", { p_student: studentId });
  if (error) throw error;
  return data || [];
}

export async function submitFeePayment({ studentId, feeId, amount, mode, reference }) {
  const { data, error } = await supabase.rpc("submit_fee_payment", {
    p_student: studentId, p_fee: feeId, p_amount: Number(amount), p_mode: mode, p_reference: reference || null,
  });
  if (error) throw error;
  return data;
}

export async function verifyFeePayment(paymentId) {
  const { data, error } = await supabase.rpc("verify_fee_payment", { p_payment: paymentId });
  if (error) throw error;
  return data;
}

export async function rejectFeePayment(paymentId, reason) {
  const { data, error } = await supabase.rpc("reject_fee_payment", { p_payment: paymentId, p_reason: reason || null });
  if (error) throw error;
  return data;
}

export async function recordOfflinePayment({ studentId, feeId, amount, mode, reference }) {
  const { data, error } = await supabase.rpc("admin_record_payment", {
    p_student: studentId, p_fee: feeId, p_amount: Number(amount), p_mode: mode, p_reference: reference || null,
  });
  if (error) throw error;
  return data;
}

export async function getReceipt(paymentId) {
  const { data, error } = await supabase.rpc("get_payment_receipt", { p_payment: paymentId });
  if (error) throw error;
  return data;
}

export async function listPaymentHistory(studentId) {
  const { data, error } = await supabase
    .from("fee_payments")
    .select("id, fee_structure_id, amount_paid, payment_date, mode, status, receipt_no, reference_note, rejection_reason, verified_at, created_at, fee_structure ( fee_type )")
    .eq("student_id", studentId)
    .neq("status", "due")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Admin queue: payments awaiting verification, oldest first. */
export async function listPendingQueue() {
  const { data, error } = await supabase
    .from("fee_payments")
    .select("id, student_id, fee_structure_id, amount_paid, payment_date, mode, reference_note, created_at, fee_structure ( fee_type, amount, classes ( name, section ) ), students ( roll_no, student_code, profiles!students_id_fkey ( full_name ) )")
    .eq("status", "pending_verification")
    .order("created_at");
  if (error) throw error;
  return data || [];
}

/** Admin: filterable payment ledger (server-side filter + pagination). */
export async function searchPayments({ status, from, to, page = 0, pageSize = 25 }) {
  let q = supabase
    .from("fee_payments")
    .select("id, student_id, amount_paid, payment_date, mode, status, receipt_no, reference_note, verified_at, fee_structure ( fee_type ), students ( roll_no, student_code, profiles!students_id_fkey ( full_name ) )", { count: "exact" })
    .neq("status", "due")
    .order("created_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (status) q = q.eq("status", status);
  if (from) q = q.gte("payment_date", from);
  if (to) q = q.lte("payment_date", to);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}
