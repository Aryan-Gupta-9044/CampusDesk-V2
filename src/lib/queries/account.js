import { supabase } from "../supabaseClient";

export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function verifyRecoveryToken(tokenHash) {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (error) throw error;
}

export async function completePasswordReset(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function updateMyPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function updateMyProfile(userId, { fullName, phone }) {
  const { error } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", userId);
  if (error) throw error;
}
