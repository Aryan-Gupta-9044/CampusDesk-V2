import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { verifyRecoveryToken, completePasswordReset } from "../../lib/queries/account";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const [verifying, setVerifying] = useState(true);
  const [verifyError, setVerifyError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!tokenHash || type !== "recovery") {
      setVerifyError("This reset link is invalid or incomplete.");
      setVerifying(false);
      return;
    }
    verifyRecoveryToken(tokenHash)
      .then(() => setVerifying(false))
      .catch((err) => {
        setVerifyError(err.message || "This reset link is invalid or has expired.");
        setVerifying(false);
      });
  }, [tokenHash, type]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    if (password.length < 6) {
      setSubmitError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await completePasswordReset(password);
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page form-page auth-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Account recovery</p>
          <h1>Set a new password</h1>
        </div>
      </section>

      {verifying ? (
        <p className="lede">Verifying your reset link…</p>
      ) : verifyError ? (
        <div className="student-form">
          <p className="form-error">{verifyError}</p>
          <div className="form-actions">
            <Link className="button primary-button" to="/forgot-password">
              Request a new link
            </Link>
          </div>
        </div>
      ) : done ? (
        <p className="lede">Password updated. Redirecting you to login…</p>
      ) : (
        <form className="student-form" onSubmit={handleSubmit}>
          {submitError && <p className="form-error">{submitError}</p>}
          <div className="form-grid">
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="button primary-button" type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Set new password"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default ResetPassword;
