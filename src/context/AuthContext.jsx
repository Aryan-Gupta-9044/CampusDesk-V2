import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext();

function friendlyAuthError(error) {
  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("invalid login")) return "Incorrect email or password.";
  if (msg.includes("email not confirmed")) return "Please confirm your email before logging in.";
  if (msg.includes("invalid api key") || msg.includes("apikey")) return "The app is not configured correctly (invalid Supabase key).";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "Unable to reach the server. Check your connection and try again.";
  return "Unable to log in. Please try again.";
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);          // initial session check
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [authError, setAuthError] = useState(null);
  const profileIdRef = useRef(null);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      profileIdRef.current = null;
      setProfile(null);
      setProfileError(false);
      return null;
    }
    setProfileLoading(true);
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error || !data) {
      if (import.meta.env.DEV) console.error("[CampusDesk] failed to load profile:", error?.message || "no profile row");
      setProfile(null);
      setProfileError(true);
    } else {
      profileIdRef.current = data.id;
      setProfile(data);
      setProfileError(false);
    }
    setProfileLoading(false);
    return data || null;
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session?.user?.id);
      if (mounted) setLoading(false);
    }).catch((err) => {
      if (import.meta.env.DEV) console.error("[CampusDesk] getSession failed:", err);
      if (mounted) setLoading(false);
    });

    // Do not await Supabase calls inside this callback (it can deadlock the client).
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        profileIdRef.current = null;
        setProfile(null);
        setProfileError(false);
        return;
      }
      if (profileIdRef.current !== newSession.user.id) {
        setProfileLoading(true);
        setTimeout(() => loadProfile(newSession.user.id), 0);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = async ({ email, password }) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (import.meta.env.DEV) console.error("[CampusDesk] sign-in failed:", error.message);
      const message = friendlyAuthError(error);
      setAuthError(message);
      return { error: { message } };
    }

    // Block suspended accounts even though auth succeeded.
    const { data: profileRow } = await supabase.from("profiles").select("status").eq("id", data.user.id).maybeSingle();
    if (profileRow?.status === "suspended") {
      await supabase.auth.signOut();
      const message = "This account has been suspended. Contact your administrator.";
      setAuthError(message);
      return { error: { message } };
    }
    return { data };
  };

  // Self-signup always creates a student profile (the database ignores any role sent).
  const signUp = async ({ email, password, fullName }) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password, options: { data: { full_name: fullName } },
    });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    profileIdRef.current = null;
    setProfile(null);
    setSession(null);
  };

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    isSuspended: profile?.status === "suspended",
    loading: loading || profileLoading,
    profileError,
    authError,
    signIn,
    signUp,
    signOut,
    refreshProfile: () => loadProfile(session?.user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
