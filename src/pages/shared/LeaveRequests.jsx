import React, { useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import {
  listMyLeaveRequests,
  createLeaveRequest,
  listPendingStudentLeaveForTeacher,
  listAllLeaveRequestsForAdmin,
  setLeaveStatus,
} from "../../lib/queries/leave";
import { logAction } from "../../lib/queries/audit";
import { friendlyError } from "../../lib/errors";

const emptyForm = { fromDate: "", toDate: "", reason: "" };

function LeaveRequests() {
  const { role, user } = useAuth();
  const [mine, setMine] = useState([]);
  const [toApprove, setToApprove] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const canApply = role === "student" || role === "teacher";
  const canApprove = role === "admin" || role === "teacher";

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (canApply) {
        const data = await listMyLeaveRequests(user.id);
        setMine(data);
      }
      if (role === "admin") {
        const data = await listAllLeaveRequestsForAdmin();
        setToApprove(data);
      } else if (role === "teacher") {
        const data = await listPendingStudentLeaveForTeacher();
        setToApprove(data);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.fromDate || !form.toDate) {
      setError("Pick both dates.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await createLeaveRequest(form, user.id, role);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (request, status) => {
    try {
      await setLeaveStatus(request.id, status, user.id);
      await logAction(user.id, `leave_${status}`, "leave_requests", request.id, { requester: request.profiles?.full_name });
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Leave</p>
          <h1>Leave requests</h1>
          <p className="lede">
            {role === "admin"
              ? "Review and approve leave across the institution."
              : role === "teacher"
              ? "Approve leave from your students, or apply for your own."
              : "Apply for leave and track your requests."}
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="lede">Loading…</p>
      ) : !canApply && !canApprove ? (
        <p className="lede">Leave requests aren't applicable to your account.</p>
      ) : (
        <div className="detail-grid">
          {canApprove && (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{role === "admin" ? "All requests" : "Student requests"}</p>
                  <h2>{toApprove.filter((r) => r.status === "pending").length} pending</h2>
                </div>
              </div>
              {toApprove.length === 0 ? (
                <p className="lede" style={{ padding: "20px 26px" }}>
                  Nothing here yet.
                </p>
              ) : (
                toApprove.map((r) => (
                  <div className="recent-row" key={r.id} style={{ alignItems: "flex-start" }}>
                    <span className="student-summary">
                      <strong>{r.profiles?.full_name}</strong>
                      <small>
                        {r.from_date} → {r.to_date} {r.requester_role ? `· ${r.requester_role}` : ""}
                      </small>
                      {r.reason && <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "12px" }}>{r.reason}</p>}
                    </span>
                    {r.status === "pending" ? (
                      <span style={{ display: "flex", gap: "8px" }}>
                        <button className="text-link" type="button" onClick={() => handleDecision(r, "approved")}>
                          Approve
                        </button>
                        <button className="delete-button" type="button" onClick={() => handleDecision(r, "rejected")} title="Reject">
                          ×
                        </button>
                      </span>
                    ) : (
                      <span className={`status ${r.status === "approved" ? "status-active" : "status-leave"}`}>
                        <span className="dot"></span>
                        {r.status}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {canApply && (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">My requests</p>
                  <h2>{mine.length} submitted</h2>
                </div>
              </div>
              {mine.map((r) => (
                <div className="recent-row" key={r.id}>
                  <span className="student-summary">
                    <strong>
                      {r.from_date} → {r.to_date}
                    </strong>
                    <small>{r.reason}</small>
                  </span>
                  <span
                    className={`status ${
                      r.status === "approved" ? "status-active" : r.status === "rejected" ? "status-leave" : "status-leave"
                    }`}
                  >
                    <span className="dot"></span>
                    {r.status}
                  </span>
                </div>
              ))}

              <form onSubmit={handleSubmit} className="student-form" style={{ boxShadow: "none", borderTop: "1px solid var(--line)" }}>
                <p className="eyebrow" style={{ marginTop: "10px" }}>
                  Apply for leave
                </p>
                <div className="form-grid">
                  <label>
                    From
                    <input type="date" name="fromDate" value={form.fromDate} onChange={handleChange} required />
                  </label>
                  <label>
                    To
                    <input type="date" name="toDate" value={form.toDate} onChange={handleChange} required />
                  </label>
                </div>
                <label style={{ display: "block", marginBottom: "12px" }}>
                  Reason
                  <textarea
                    name="reason"
                    value={form.reason}
                    onChange={handleChange}
                    rows={2}
                    style={{ width: "100%", border: "1px solid var(--line)", padding: "10px", font: "13px Arial, sans-serif" }}
                  />
                </label>
                <div className="form-actions">
                  <button type="submit" className="button primary-button" disabled={submitting}>
                    {submitting ? "Submitting…" : "Submit request"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LeaveRequests;
