import { supabase } from "../supabaseClient";

export const useEdgeFunctions = () =>
  String(import.meta.env.REACT_APP_USE_EDGE_FUNCTIONS || import.meta.env.VITE_USE_EDGE_FUNCTIONS || "").toLowerCase() === "true";

/** Admin-only account creation through the `create-user` Edge Function (service role stays server-side). */
export async function createAccountViaEdge(payload) {
  const { data, error } = await supabase.functions.invoke("create-user", { body: payload });
  if (error) {
    let code = error.message;
    try { code = (await error.context?.json?.())?.error || code; } catch { /* keep message */ }
    const e = new Error(code === "email_exists" ? "duplicate key: that email already exists" : `create-user: ${code}`);
    e.code = code === "email_exists" ? "23505" : undefined;
    throw e;
  }
  return data.id;
}
