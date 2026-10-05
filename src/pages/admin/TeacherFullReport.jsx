import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getTeacher } from "../../lib/queries/teachers";
import { getTeacherSubjectBreakdown } from "../../lib/queries/academicReport";
import { listMyLeaveRequests } from "../../lib/queries/leave";
import { listMyDocuments } from "../../lib/storage";
import { friendlyError } from "../../lib/errors";

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function TeacherFullReport() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const teacher = await getTeacher(id);
        const [breakdown, leave, documents] = await Promise.all([
          getTeacherSubjectBreakdown(id),
          listMyLeaveRequests(id),
          listMyDocuments(id).catch(() => []),
        ]);
        setData({ teacher, breakdown, leave, documents });
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <p className="lede page">Loading full report…</p>;
  if (error) return <p className="form-error page">{error}</p>;
  if (!data) return null;

  const { teacher, breakdown, leave, documents } = data;

  return (
    <div className="page details-page">
      <Link className="text-link" to={`/teachers/${id}`}>
        ← Back to teacher
      </Link>

      <div className="profile-header">
        <span className="profile-avatar">{initials(teacher.profiles?.full_name)}</span>
        <div>
          <p className="eyebrow">Full report</p>
          <h1>{teacher.profiles?.full_name}</h1>
          <p className="lede">
            {teacher.department || "No department"} · ID {teacher.employee_id || "—"}
          </p>
        </div>
      </div>

      {breakdown.length === 0 ? (
        <p className="lede">Not assigned to any classes/subjects yet.</p>
      ) : (
        breakdown.map((d) => (
          <div className="panel" key={d.label} style={{ marginBottom: "16px" }}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{d.label}</p>
                <h2>{d.attendancePct}% cumulative attendance</h2>
              </div>
            </div>
            {d.examBreakdown.length === 0 ? (
              <p className="lede" style={{ padding: "16px 26px" }}>No marks entered.</p>
            ) : (
              d.examBreakdown.map((e) => (
                <div className="recent-row" key={e.exam}>
                  <span className="student-summary">
                    <strong>{e.exam}</strong>
                  </span>
                  <span className="course-cell">
                    <strong>{e.avgPercentage}%</strong>
                    <small>class average</small>
                  </span>
                </div>
              ))
            )}
          </div>
        ))
      )}

      <div className="panel" style={{ marginBottom: "16px" }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Leave requests</p>
          </div>
        </div>
        {leave.length === 0 ? (
          <p className="lede" style={{ padding: "16px 26px" }}>None submitted.</p>
        ) : (
          leave.map((l) => (
            <div className="recent-row" key={l.id}>
              <span className="student-summary">
                <strong>{l.from_date} → {l.to_date}</strong>
                <small>{l.reason}</small>
              </span>
              <span className={`status ${l.status === "approved" ? "status-active" : "status-leave"}`}>
                <span className="dot"></span>
                {l.status}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Documents</p>
          </div>
        </div>
        {documents.length === 0 ? (
          <p className="lede" style={{ padding: "16px 26px" }}>No documents uploaded.</p>
        ) : (
          documents.map((f) => (
            <div className="recent-row" key={f.path}>
              <span className="student-summary">
                <strong>{f.name}</strong>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default TeacherFullReport;
