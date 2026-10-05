import React, { useEffect, useState } from "react";

import { listAuditLogs } from "../../lib/queries/audit";
import { friendlyError } from "../../lib/errors";

const ACTION_LABELS = {
  suspend_student: "Suspended student",
  reactivate_student: "Reactivated student",
  suspend_teacher: "Suspended teacher",
  reactivate_teacher: "Reactivated teacher",
  unlink_parent: "Unlinked parent",
  leave_approved: "Approved leave",
  leave_rejected: "Rejected leave",
  publish_results: "Published results",
};

function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listAuditLogs()
      .then(setLogs)
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Accountability</p>
          <h1>Audit log</h1>
          <p className="lede">Most recent 200 admin actions, newest first.</p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="lede">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="lede">No actions logged yet.</p>
      ) : (
        <div className="student-list">
          {logs.map((log) => (
            <div className="recent-row" key={log.id}>
              <span className="student-summary">
                <strong>{ACTION_LABELS[log.action] || log.action}</strong>
                <small>
                  {log.profiles?.full_name || "Unknown"} · {new Date(log.created_at).toLocaleString()}
                </small>
              </span>
              {log.details?.name && <span className="course-cell">{log.details.name}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AuditLog;
