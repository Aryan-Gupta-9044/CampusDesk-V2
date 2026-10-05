import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { listTeachers, setTeacherStatus } from "../../lib/queries/teachers";
import { logAction } from "../../lib/queries/audit";
import { useAuth } from "../../context/AuthContext";
import { friendlyError } from "../../lib/errors";

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function AdminTeachers() {
  const { user } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTeachers();
      setTeachers(data);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return teachers.filter((t) => {
      const name = t.profiles?.full_name || "";
      const email = t.profiles?.email || "";
      return `${name} ${email} ${t.employee_id || ""} ${t.department || ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
    });
  }, [teachers, search]);

  const handleToggleStatus = async (teacher) => {
    const nextStatus = teacher.profiles?.status === "active" ? "suspended" : "active";
    const verb = nextStatus === "suspended" ? "Suspend" : "Reactivate";
    if (!window.confirm(`${verb} ${teacher.profiles?.full_name}?`)) return;
    try {
      await setTeacherStatus(teacher.id, nextStatus);
      await logAction(user.id, nextStatus === "suspended" ? "suspend_teacher" : "reactivate_teacher", "teachers", teacher.id, {
        name: teacher.profiles?.full_name,
      });
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="page students-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Faculty</p>
          <h1>All teachers</h1>
          <p className="lede">Browse, filter and manage faculty records.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link className="button secondary-button" to="/teachers/import">
            Import CSV
          </Link>
          <Link className="button primary-button" to="/teachers/new">
            <span>+</span> Add teacher
          </Link>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="toolbar">
        <label className="search-wrap">
          <span>⌕</span>
          <input
            type="text"
            placeholder="Search by name, email, employee ID or department"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <div className="list-meta">
        <p>
          Showing <strong>{filtered.length}</strong> of {teachers.length} teachers
        </p>
        <span className="status-legend">
          <span className="dot green-dot"></span> Active <span className="dot grey-dot"></span> Suspended
        </span>
      </div>

      {loading ? (
        <p className="lede">Loading…</p>
      ) : (
        <div className="student-list">
          {filtered.length === 0 ? (
            <p>No teachers found.</p>
          ) : (
            filtered.map((teacher) => (
              <div className="student-card" key={teacher.id}>
                <span className="avatar">{initials(teacher.profiles?.full_name)}</span>
                <div className="student-summary">
                  <h3>{teacher.profiles?.full_name || "—"}</h3>
                  <p>{teacher.profiles?.email}</p>
                </div>
                <div className="course-cell">
                  <strong>{teacher.department || "—"}</strong>
                  <small>ID {teacher.employee_id || "—"}</small>
                </div>
                <span
                  className={`status ${teacher.profiles?.status === "active" ? "status-active" : "status-leave"}`}
                >
                  <span className="dot"></span>
                  {teacher.profiles?.status === "active" ? "Active" : "Suspended"}
                </span>
                <Link className="row-link" to={`/teachers/${teacher.id}`}>
                  View <span>→</span>
                </Link>
                <button
                  className="delete-button"
                  type="button"
                  onClick={() => handleToggleStatus(teacher)}
                  title={teacher.profiles?.status === "active" ? "Suspend" : "Reactivate"}
                >
                  {teacher.profiles?.status === "active" ? "⏸" : "↺"}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default AdminTeachers;
