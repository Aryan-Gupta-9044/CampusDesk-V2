import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.REACT_APP_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.REACT_APP_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

let client = null;

/**
 * Calling `supabase.auth.signUp()` on the main client would overwrite the
 * currently logged-in admin's session with the newly created user's session
 * — Supabase clients only track one session at a time. This second client
 * never persists or reads a session, so an admin can create Student/Teacher
 * accounts (which requires calling signUp under the hood) without ever being
 * logged out of their own session.
 *
 * Built lazily (only the first time an admin actually creates an account)
 * rather than as a top-level singleton, so pages that never touch this
 * flow don't spin up a second GoTrueClient instance for no reason —
 * that's what was causing the "Multiple GoTrueClient instances detected"
 * console warning on every page load. The warning itself was harmless
 * (the two clients use different storage keys and never actually
 * collide), but there's no reason to pay the cost when it's not needed.
 *
 * Note: this is a pragmatic client-side workaround. The more robust way to
 * do "admin creates user" in production is a server-side Edge Function using
 * the service_role key (supabase.auth.admin.createUser) — worth moving to
 * later, but this keeps things simple for now with no backend to deploy.
 */
export function getAdminActionClient() {
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: "campusdesk-admin-action",
      },
    });
  }
  return client;
}
