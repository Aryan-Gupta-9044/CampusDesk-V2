import React, { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

function Signup() {
  const { signUp } = useAuth();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "student",
  });
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signUpError } = await signUp(form);
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="page form-page auth-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Almost there</p>
            <h1>Check your inbox</h1>
            <p className="lede">
              We've sent a confirmation link to {form.email}. Confirm your email, then log in.
            </p>
          </div>
        </section>
        <Link className="button primary-button" to="/login">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div className="page form-page auth-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">First time here</p>
          <h1>Create your account</h1>
          <p className="lede">Set up access to CampusDesk.</p>
        </div>
      </section>

      <form className="student-form" onSubmit={handleSubmit}>
        {error && <p className="form-error">{error}</p>}
        <div className="form-grid">
          <label>
            Full name
            <input name="fullName" value={form.fullName} onChange={handleChange} required />
          </label>
          <label>
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
        </div>
        <p className="lede" style={{ marginTop: "-10px" }}>
          Self-registered accounts start as student accounts. Teacher, Parent and Admin accounts are
          created or upgraded by an administrator.
        </p>
        <div className="form-actions">
          <Link className="button secondary-button" to="/login">
            Already have an account?
          </Link>
          <button className="button primary-button" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default Signup;
