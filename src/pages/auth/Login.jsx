import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { friendlyError } from "../../lib/errors";

// DEMO accounts created by database/04_seed_data.sql. Shown only to help people
// try the app; they still sign in through real Supabase authentication.
const DEMO = [
  { label: "Student", email: "student1@campusdesk.com", password: "Student@123" },
  { label: "Teacher", email: "teacher1@campusdesk.com", password: "Teacher@123" },
  { label: "Parent", email: "parent1@campusdesk.com", password: "Parent@123" },
  { label: "Admin", email: "admin@campusdesk.com", password: "Admin@123" },
];

function Login() {
  const { signIn, session, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const redirectTo = location.state?.from?.pathname || "/";

  if (session && profile) return <Navigate to="/" replace />;

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(form);
    setSubmitting(false);
    if (err) { setError(friendlyError(err)); return; }
    navigate(redirectTo, { replace: true });
  };

  return (
    <div className="auth-page">
      <div className="login-wrap">
        <div className="login-side">
          <span className="brand-mark" style={{ background: "#fff", color: "var(--primary)" }} aria-hidden="true">C</span>
          <h1>CampusDesk</h1>
          <p>Student management and campus productivity, in one place for students, teachers, parents and administrators.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <div>
            <h2>Welcome back</h2>
            <p className="lede" style={{ marginBottom: 0 }}>Log in to open your dashboard.</p>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <label>Email
            <input type="email" name="email" value={form.email} onChange={handleChange} required autoComplete="email" />
          </label>
          <label>Password
            <input type="password" name="password" value={form.password} onChange={handleChange} required autoComplete="current-password" />
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? "Logging in…" : "Log in"}</button>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Link className="text-link" to="/forgot-password">Forgot password?</Link>
            <Link className="text-link" to="/signup">Create account</Link>
          </div>
          <div className="demo-box">
            <strong>Demo accounts</strong> (sample data only) — click to fill:<br />
            {DEMO.map((d) => (
              <button key={d.label} type="button" className="btn btn-outline btn-sm" onClick={() => setForm({ email: d.email, password: d.password })}>{d.label}</button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
