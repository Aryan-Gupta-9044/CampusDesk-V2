import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { supabase } from "../lib/supabaseClient";
import { REQUESTABLE_ROLES, deriveAccount } from "../auth/accessRules";

export const AuthContext = createContext(null);

const REMEMBER_KEY = "campusdesk-remember";
const SESSION_MARK = "campusdesk-active-session";
const RECOVERY_KEY = "campusdesk-recovery-requested";
// A password-reset link opened in this browser returns to the app with ?code=... (PKCE flow)
const OPENED_WITH_CODE = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("code");

const store = {
  get: (s, k) => { try { return s.getItem(k); } catch { return null; } },
  set: (s, k, v) => { try { s.setItem(k, v); } catch { /* storage unavailable */ } },
  del: (s, k) => { try { s.removeItem(k); } catch { /* storage unavailable */ } },
};

function friendlyAuthError(error) {
  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("invalid login")) return "Invalid email or password.";
  if (msg.includes("email not confirmed")) return "Please confirm your email address first (check your inbox), then log in.";
  if (msg.includes("invalid api key") || msg.includes("apikey")) return "The app is not configured correctly. Please contact an administrator.";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "Unable to reach the server. Check your connection and try again.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  return "Unable to log in. Please try again.";
}

/** Account state from the database. Falls back to the profile row when migration 008 is not installed yet. */
async function fetchAccountRaw(userId) {
  const rpc = await supabase.rpc("my_account_state");
  if (!rpc.error && rpc.data && typeof rpc.data === "object") return rpc.data;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return { exists: false };
  return { exists: true, status: data.status, role: data.role, requested_role: data.requested_role ?? null, full_name: data.full_name,
           email: data.email, rejection_reason: data.rejection_reason ?? null, status_reason: data.status_reason ?? null, entity_ok: true };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState(null);
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const seq = useRef(0);
  const loadedFor = useRef(null);
  const inflightFor = useRef(null);

  const loadAccount = useCallback(async (userId, { silent = false } = {}) => {
    if (!userId) { loadedFor.current = null; setAccount(null); setProfile(null); setAccountError(false); return null; }
    const mine = ++seq.current;
    inflightFor.current = userId;
    if (!silent) setAccountLoading(true);
    try {
      const raw = await fetchAccountRaw(userId);
      const derived = deriveAccount(raw);
      let prof = null;
      if (derived.state !== "no_profile") {
        const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
        prof = data || null;
      }
      if (mine !== seq.current) return null;               // a newer load superseded this one
      loadedFor.current = userId;
      setAccount(derived); setProfile(prof); setAccountError(false);
      return derived;
    } catch (err) {
      if (import.meta.env.DEV) console.error("[CampusDesk] failed to load account:", err?.message || err);
      if (mine === seq.current) { setAccount(null); setProfile(null); setAccountError(true); }
      return null;
    } finally {
      if (mine === seq.current) { setAccountLoading(false); inflightFor.current = null; }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // "Remember me" unticked: end the session when a new browser session starts
      if (store.get(localStorage, REMEMBER_KEY) === "0" && !store.get(sessionStorage, SESSION_MARK)) {
        await supabase.auth.signOut().catch(() => {});
      }
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session);
        if (data.session) {
          if (OPENED_WITH_CODE && store.get(localStorage, RECOVERY_KEY)) setRecovery(true);
          await loadAccount(data.session.user.id);
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error("[CampusDesk] getSession failed:", err);
      } finally {
        if (mounted) setBooting(false);
      }
    })();

    // Do not await Supabase calls inside this callback (it can deadlock the client).
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(newSession);
      if (!newSession) { seq.current += 1; loadedFor.current = null; setAccount(null); setProfile(null); setAccountError(false); setAccountLoading(false); return; }
      if (OPENED_WITH_CODE && store.get(localStorage, RECOVERY_KEY) && event === "SIGNED_IN") setRecovery(true);
      const uid = newSession.user.id;
      if (loadedFor.current !== uid && inflightFor.current !== uid) {
        setAccountLoading(true);
        setTimeout(() => loadAccount(uid), 0);
      }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [loadAccount]);

  /** Returns { state } on success (so the caller can route), or { error: { message } }. */
  const signIn = async ({ email, password, remember = true }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (import.meta.env.DEV) console.error("[CampusDesk] sign-in failed:", error.message);
      return { error: { message: friendlyAuthError(error) } };
    }
    store.set(localStorage, REMEMBER_KEY, remember ? "1" : "0");
    store.set(sessionStorage, SESSION_MARK, "1");
    const derived = await loadAccount(data.user.id);
    if (!derived) return { error: { message: "We couldn't load your account. Please try again." } };
    if (derived.state === "no_profile") {
      await supabase.auth.signOut();
      return { error: { message: "Your account has been created but your CampusDesk profile has not been provisioned yet. Please contact an administrator." } };
    }
    return { state: derived.state };
  };

  /**
   * Public registration. The requested role is only a REQUEST (stored as requested_role by the database).
   * A `role` is never sent. The database creates the account as 'pending'.
   */
  const signUp = async ({ email, password, fullName, phone, requestedRole }) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: fullName.trim(), phone: (phone || "").trim(), requested_role: REQUESTABLE_ROLES.includes(requestedRole) ? requestedRole : null } },   // a request only; never a `role`
    });
    if (error) {
      const m = (error.message || "").toLowerCase();
      const message = m.includes("already") ? "An account with this email already exists. Try logging in instead."
        : m.includes("password") ? "Please choose a stronger password (at least 8 characters)."
        : m.includes("failed to fetch") ? "Unable to reach the server. Check your connection and try again."
        : "We couldn't create your account. Please try again.";
      return { error: { message } };
    }
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { error: { message: "An account with this email already exists. Try logging in instead." } };
    }
    return { data, needsEmailConfirmation: !data.session };
  };

  const signOut = async () => {
    seq.current += 1;
    await supabase.auth.signOut();
    store.del(sessionStorage, SESSION_MARK);
    loadedFor.current = null;
    setSession(null); setAccount(null); setProfile(null); setRecovery(false);
  };

  const refreshAccount = useCallback(async () => (session ? loadAccount(session.user.id, { silent: true }) : null), [session, loadAccount]);
  const clearRecovery = () => { store.del(localStorage, RECOVERY_KEY); setRecovery(false); };

  const loading = booting || accountLoading;
  const state = loading ? "loading" : !session ? "unauthenticated" : accountError ? "error" : account ? account.state : "loading";
  const role = account?.state === "active" ? account.role : null;      // role exists ONLY for an active account

  const value = {
    session, user: session?.user ?? null, profile, account, state, role, loading, accountError, recovery, clearRecovery,
    signIn, signUp, signOut, refreshAccount, refreshProfile: refreshAccount,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { RECOVERY_KEY };
