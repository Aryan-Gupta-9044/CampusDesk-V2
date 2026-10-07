import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { REQUESTABLE_ROLES } from "../../auth/accessRules";
import ThemeToggle from "../../components/layout/ThemeToggle";
import { useAuth } from "../../context/AuthContext";

const LABEL = { student: "Student", parent: "Parent / guardian", teacher: "Teacher" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Public registration. Collects an applicant's details and a REQUESTED account type only. */
export default function Signup() {
  const { signUp, session, state } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", requestedRole: "student", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (session && state !== "loading" && state !== "unauthenticated") return <Navigate to="/" replace />;

  const set = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.fullName.trim()) return setError("Please enter your full name.");
    if (!EMAIL_RE.test(form.email.trim())) return setError("Please enter a valid email address.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    if (form.password !== form.confirm) return setError("Passwords don't match.");
    if (!REQUESTABLE_ROLES.includes(form.requestedRole)) return setError("Please choose an account type.");
    setBusy(true);
    const { error: err, needsEmailConfirmation } = await signUp(form);
    setBusy(false);
    if (err) return setError(err.message);
    navigate("/pending-approval", { replace: true, state: { justRegistered: true, email: form.email.trim(), requestedRole: form.requestedRole, needsEmailConfirmation } });
  };

  return (
    <div className="auth-page">
      <div className="auth-theme"><ThemeToggle /></div>
      <div className="login-wrap">
        <div className="login-side">
          <span className="brand-mark" style={{ background: "var(--on-primary)", color: "var(--primary)" }} aria-hidden="true">C</span>
          <h1>Join CampusDesk</h1>
          <p>Create your account and an administrator will review it. You'll get access as soon as it is approved.</p>
          <ol className="steps"><li>Register</li><li>Administrator reviews</li><li>Account activated</li><li>Log in to your dashboard</li></ol>
        </div>
        <form className="login-form" onSubmit={submit} noValidate>
          <div><h2>Create your CampusDesk account</h2><p className="lede" style={{ marginBottom: 0 }}>Takes a minute. No access is granted until approval.</p></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <label>Full name<input name="fullName" value={form.fullName} onChange={set} autoComplete="name" required /></label>
          <label>Email<input type="email" name="email" value={form.email} onChange={set} autoComplete="email" required /></label>
          <label>Phone (optional)<input type="tel" name="phone" value={form.phone} onChange={set} autoComplete="tel" /></label>
          <label>I'm registering as
            <select name="requestedRole" value={form.requestedRole} onChange={set}>
              {REQUESTABLE_ROLES.map((r) => <option key={r} value={r}>{LABEL[r]}</option>)}
            </select>
          </label>
          <p className="feed-meta" style={{ marginTop: -6 }}>This is only a <b>request</b>. Your requested account type will be reviewed by an administrator, who assigns your actual role.</p>
          <label>Password<input type="password" name="password" value={form.password} onChange={set} autoComplete="new-password" minLength={8} required /></label>
          <label>Confirm password<input type="password" name="confirm" value={form.confirm} onChange={set} autoComplete="new-password" required /></label>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
          <p className="feed-meta">Already registered? <Link to="/login">Log in</Link></p>
        </form>
      </div>
    </div>
  );
}
