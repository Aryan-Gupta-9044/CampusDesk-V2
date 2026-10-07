import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.REACT_APP_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.REACT_APP_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surfacing this loudly in the console saves a lot of confused debugging
  // the first time this project is cloned onto a new machine.
  console.error(
    "Missing Supabase env vars. Copy .env.example to .env, fill in " +
      "REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY from your " +
      "Supabase project settings, then restart `npm start`."
  );
}

// PKCE: email links (password reset, email confirmation) come back as ?code=... in the query string.
// The default "implicit" flow puts tokens in the URL #fragment, which collides with the hash router (#/route).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
});
