import { supabase } from "../supabaseClient";

// The reset link must return to the app's base URL (no #fragment): Supabase appends ?code=... for PKCE.
// Add this URL to Supabase -> Authentication -> URL Configuration -> Redirect URLs.
export const appBaseUrl = () => new URL(import.meta.env.BASE_URL || "./", window.location.href).href;

export async function requestPasswordReset(email) {
  try { localStorage.setItem("campusdesk-recovery-requested", String(Date.now())); } catch { /* storage unavailable */ }
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appBaseUrl() });
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
