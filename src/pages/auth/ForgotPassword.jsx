import React, { useState } from "react";
import { Link } from "react-router-dom";

import { requestPasswordReset } from "../../lib/queries/account";
import { friendlyError } from "../../lib/errors";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page form-page auth-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Account recovery</p>
          <h1>Reset your password</h1>
          <p className="lede">We'll email you a link to set a new password.</p>
        </div>
      </section>

      {sent ? (
        <div className="student-form">
          <p className="lede">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox (and spam
            folder), then follow the link to set a new password.
          </p>
          <div className="form-actions">
            <Link className="button primary-button" to="/login">
              Back to login
            </Link>
          </div>
        </div>
      ) : (
        <form className="student-form" onSubmit={handleSubmit}>
          {error && <p className="form-error">{error}</p>}
          <div className="form-grid">
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
          </div>
          <div className="form-actions">
            <Link className="button secondary-button" to="/login">
              Cancel
            </Link>
            <button className="button primary-button" type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default ForgotPassword;
