import StudentReportView from "../../components/report/StudentReportView";
import { useChild } from "../../context/ChildContext";
import React, { useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { getSubjectAttendanceBreakdown, getAllMarksBreakdown, getTeacherSubjectBreakdown } from "../../lib/queries/academicReport";
import { getStudentIdForParent } from "../../lib/queries/me";
import { friendlyError } from "../../lib/errors";

function TeacherReport({ teacherId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getTeacherSubjectBreakdown(teacherId)
      .then(setData)
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoading(false));
  }, [teacherId]);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h1>Academic report</h1>
          <p className="lede">Cumulative attendance and per-exam averages for everything you teach.</p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="lede">Loading…</p>
      ) : data.length === 0 ? (
        <p className="lede">You're not assigned to any classes/subjects yet.</p>
      ) : (
        data.map((d) => (
          <div className="panel" key={d.label} style={{ marginBottom: "16px" }}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{d.label}</p>
                <h2>{d.attendancePct}% cumulative attendance</h2>
              </div>
            </div>
            {d.examBreakdown.length === 0 ? (
              <p className="lede" style={{ padding: "20px 26px" }}>
                No marks entered yet.
              </p>
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
    </div>
  );
}

function AcademicReport() {
  const { role, user } = useAuth();
  const { child } = useChild();
  if (role === "student") return <StudentReportView studentId={user.id} />;
  if (role === "teacher") return <TeacherReport teacherId={user.id} />;
  if (role === "parent") {
    if (!child) return <div className="page"><p className="lede">No child is linked to your account yet. Ask the school office to link one.</p></div>;
    return <StudentReportView key={child.id} studentId={child.id} />;
  }
  return <div className="page"><p className="lede">Admins open a student's report from the Students page.</p></div>;
}

export default AcademicReport;
