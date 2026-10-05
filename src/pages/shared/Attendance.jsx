import { pctFromCounts } from "../../lib/metrics";
import React, { useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import {
  listMyTeachingAssignments,
  listClassRosterWithAttendance,
  saveAttendance,
  listMyAttendanceHistory,
  getAttendanceCounts,
  listAttendanceForClassAdmin,
} from "../../lib/queries/attendance";
import { listClasses } from "../../lib/queries/classes";
import { getStudentIdForParent } from "../../lib/queries/me";
import { friendlyError } from "../../lib/errors";

const todayISO = () => new Date().toISOString().slice(0, 10);

function TeacherAttendance({ userId }) {
  const [assignments, setAssignments] = useState([]);
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState(todayISO());
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    listMyTeachingAssignments(userId).then(setAssignments).catch((err) => setError(friendlyError(err)));
  }, [userId]);

  useEffect(() => {
    if (!selected) return;
    const [classId, subjectId] = selected.split("::");
    setLoading(true);
    setSaved(false);
    listClassRosterWithAttendance(classId, subjectId, date)
      .then(setRoster)
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoading(false));
  }, [selected, date]);

  const setStatus = (studentId, status) => {
    setRoster((prev) => prev.map((s) => (s.id === studentId ? { ...s, status } : s)));
  };

  const handleSave = async () => {
    const [classId, subjectId] = selected.split("::");
    setSaving(true);
    setError("");
    try {
      const res = await saveAttendance(classId, subjectId, date, roster);
      setSaved(res || true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Attendance</p>
          <h1>Mark attendance</h1>
          <p className="lede">Pick a class and date, mark each student, then save.</p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="toolbar">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Select class & subject</option>
          {assignments.map((a) => (
            <option key={a.id} value={`${a.class_id}::${a.subject_id}`}>
              {a.classes?.name}-{a.classes?.section} · {a.subjects?.name}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: "180px" }} />
      </div>

      {!selected ? (
        <p className="lede">Choose a class and subject to load the roster.</p>
      ) : loading ? (
        <p className="lede">Loading roster…</p>
      ) : (
        <>
          <div className="student-list">
            {roster.map((s) => (
              <div className="student-card" key={s.id} style={{ gridTemplateColumns: "38px 1.4fr 1fr" }}>
                <span className="avatar">
                  {(s.profiles?.full_name || "?")
                    .split(" ")
                    .map((p) => p[0])
                    .join("")}
                </span>
                <div className="student-summary">
                  <h3>{s.profiles?.full_name}</h3>
                  <p>Roll no. {s.roll_no || "—"}</p>
                </div>
                <select value={s.status} onChange={(e) => setStatus(s.id, e.target.value)}>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                  <option value="leave">Leave</option>
                </select>
              </div>
            ))}
          </div>
          <div className="form-actions">
            {saved && <span className="badge badge-success" role="status">✓ Attendance saved{saved.inserted !== undefined ? ` — ${saved.inserted} new, ${saved.updated} updated` : ""}</span>}
            <button className="button primary-button" type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save attendance"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function OwnAttendance({ studentId, heading }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!studentId) return;
    listMyAttendanceHistory(studentId)
      .then(setRows)
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoading(false));
  }, [studentId]);

  const [counts, setCounts] = useState(null);
  useEffect(() => { if (studentId) getAttendanceCounts(studentId).then(setCounts).catch(() => setCounts(null)); }, [studentId]);
  const percentage = counts ? pctFromCounts(counts) : null;

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Attendance</p>
          <h1>{heading}</h1>
          <p className="lede">Most recent 60 records, newest first.</p>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {counts && percentage != null && (
        <p className="lede">
          <strong>{percentage}%</strong> attendance overall — {counts.present} present, {counts.late} late, {counts.absent} absent
          {counts.leave ? `, ${counts.leave} on approved leave (not counted)` : ""}. Late counts as attended.
        </p>
      )}
      {loading ? (
        <p className="lede">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="lede">No attendance recorded yet.</p>
      ) : (
        <div className="student-list">
          {rows.map((r) => (
            <div className="recent-row" key={r.id}>
              <span className="student-summary">
                <strong>{r.subjects?.name || "General"}</strong>
                <small>{r.date}</small>
              </span>
              <span className={`status ${r.status === "present" || r.status === "late" ? "status-active" : "status-leave"}`}>
                <span className="dot"></span>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminAttendance() {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listClasses().then(setClasses).catch(() => {});
  }, []);

  const load = React.useCallback(() => {
    setLoading(true);
    listAttendanceForClassAdmin(classId || null, date || null)
      .then(setRows)
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoading(false));
  }, [classId, date]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Attendance</p>
          <h1>Institution attendance</h1>
          <p className="lede">Most recent 100 records across the institution.</p>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="toolbar">
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}-{c.section}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: "180px" }} />
      </div>
      {loading ? (
        <p className="lede">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="lede">No attendance records match this filter.</p>
      ) : (
        <div className="student-list">
          {rows.map((r) => (
            <div className="recent-row" key={r.id}>
              <span className="student-summary">
                <strong>{r.students?.profiles?.full_name}</strong>
                <small>
                  Roll no. {r.students?.roll_no || "—"} · {r.subjects?.name || "General"} · {r.date}
                </small>
              </span>
              <span className={`status ${r.status === "present" || r.status === "late" ? "status-active" : "status-leave"}`}>
                <span className="dot"></span>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Attendance() {
  const { role, user } = useAuth();
  const [linkedStudentId, setLinkedStudentId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (role === "parent") {
      getStudentIdForParent(user.id)
        .then(setLinkedStudentId)
        .catch((err) => setError(friendlyError(err)));
    }
  }, [role, user]);

  if (role === "admin") return <AdminAttendance />;
  if (role === "teacher") return <TeacherAttendance userId={user.id} />;
  if (role === "student") return <OwnAttendance studentId={user.id} heading="My attendance" />;
  if (role === "parent") {
    if (error) return <p className="form-error page">{error}</p>;
    if (!linkedStudentId)
      return (
        <div className="page">
          <p className="lede">Not linked to a child's account yet. Ask your school's administrator to set the link.</p>
        </div>
      );
    return <OwnAttendance studentId={linkedStudentId} heading="Child's attendance" />;
  }
  return null;
}

export default Attendance;
