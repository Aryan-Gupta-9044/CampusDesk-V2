import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import ThemeToggle from "../../components/layout/ThemeToggle";
import { useAuth } from "../../context/AuthContext";
import { verifyRecoveryToken, completePasswordReset } from "../../lib/queries/account";
import { supabase } from "../../lib/supabaseClient";

/**
 * Two ways in, both supported:
 *  - email link returns with ?code=... (PKCE, default Supabase email template) -> a recovery session already exists
 *  - custom template link with #/reset-password?token_hash=...&type=recovery -> verified here
 */
function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, recovery, clearRecovery } = useAuth();
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const [status, setStatus] = useState("checking");      // checking | ready | invalid | done
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tokenHash && type === "recovery") {
      verifyRecoveryToken(tokenHash).then(() => setStatus("ready")).catch(() => setStatus("invalid"));
    }
  }, [tokenHash, type]);

  useEffect(() => {
    if (tokenHash) return undefined;
    if (session && recovery) { setStatus("ready"); return undefined; }
    const t = setTimeout(() => setStatus((s) => (s === "checking" ? "invalid" : s)), 6000);   // give the code exchange a moment
    return () => clearTimeout(t);
  }, [tokenHash, session, recovery]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await completePasswordReset(password);
      clearRecovery();
      await supabase.auth.signOut();          // make them log in with the new password
      setStatus("done");
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setError("We couldn't update your password. The link may have expired — request a new one.");
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-theme"><ThemeToggle /></div>
      <div className="card status-card">
        <h1>Set a new password</h1>
        {status === "checking" && <p className="lede" role="status">Checking your reset link…</p>}
        {status === "invalid" && (<>
          <p className="form-error" role="alert">This reset link is invalid or has expired. Open the link in the same browser where you requested it, or request a new one.</p>
          <div className="status-actions"><Link className="btn btn-primary" to="/forgot-password">Request a new link</Link><Link className="btn btn-outline" to="/login">Back to login</Link></div>
        </>)}
        {status === "ready" && (
          <form className="student-form" onSubmit={submit}>
            {error && <p className="form-error" role="alert">{error}</p>}
            <label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
            <label>Confirm new password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></label>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
          </form>)}
        {status === "done" && <p className="notice-inline info" role="status">Password updated. Redirecting you to log in…</p>}
      </div>
    </div>
  );
}

export default ResetPassword;
