import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { listStudents, setStudentStatus } from "../../lib/queries/students";
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

function AdminStudents() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("All classes");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listStudents();
      setStudents(data);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const classOptions = useMemo(() => {
    const labels = students
      .filter((s) => s.classes)
      .map((s) => `${s.classes.name}-${s.classes.section}`);
    return [...new Set(labels)];
  }, [students]);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const name = s.profiles?.full_name || "";
      const email = s.profiles?.email || "";
      const matchesSearch = `${name} ${email} ${s.roll_no || ""}`.toLowerCase().includes(search.toLowerCase());
      const label = s.classes ? `${s.classes.name}-${s.classes.section}` : "";
      const matchesClass = classFilter === "All classes" || label === classFilter;
      return matchesSearch && matchesClass;
    });
  }, [students, search, classFilter]);

  const handleToggleStatus = async (student) => {
    const nextStatus = student.profiles?.status === "active" ? "suspended" : "active";
    const verb = nextStatus === "suspended" ? "Suspend" : "Reactivate";
    if (!window.confirm(`${verb} ${student.profiles?.full_name}?`)) return;
    try {
      await setStudentStatus(student.id, nextStatus);
      await logAction(user.id, nextStatus === "suspended" ? "suspend_student" : "reactivate_student", "students", student.id, {
        name: student.profiles?.full_name,
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
          <p className="eyebrow">Directory</p>
          <h1>All students</h1>
          <p className="lede">Browse, filter and manage student records.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link className="button secondary-button" to="/students/import">
            Import CSV
          </Link>
          <Link className="button primary-button" to="/students/new">
            <span>+</span> Add student
          </Link>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="toolbar">
        <label className="search-wrap">
          <span>⌕</span>
          <input
            type="text"
            placeholder="Search by name, email or roll no."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option>All classes</option>
          {classOptions.map((label) => (
            <option key={label}>{label}</option>
          ))}
        </select>
      </div>

      <div className="list-meta">
        <p>
          Showing <strong>{filtered.length}</strong> of {students.length} students
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
            <p>No students found.</p>
          ) : (
            filtered.map((student) => (
              <div className="student-card" key={student.id}>
                <span className="avatar">{initials(student.profiles?.full_name)}</span>
                <div className="student-summary">
                  <h3>{student.profiles?.full_name || "—"}</h3>
                  <p>{student.profiles?.email}</p>
                </div>
                <div className="course-cell">
                  <strong>{student.classes ? `${student.classes.name}-${student.classes.section}` : "Unassigned"}</strong>
                  <small>Roll no. {student.roll_no || "—"}</small>
                </div>
                <span
                  className={`status ${student.profiles?.status === "active" ? "status-active" : "status-leave"}`}
                >
                  <span className="dot"></span>
                  {student.profiles?.status === "active" ? "Active" : "Suspended"}
                </span>
                <Link className="row-link" to={`/students/${student.id}`}>
                  View <span>→</span>
                </Link>
                <button
                  className="delete-button"
                  type="button"
                  onClick={() => handleToggleStatus(student)}
                  aria-label={
                    student.profiles?.status === "active"
                      ? `Suspend ${student.profiles?.full_name}`
                      : `Reactivate ${student.profiles?.full_name}`
                  }
                  title={student.profiles?.status === "active" ? "Suspend" : "Reactivate"}
                >
                  {student.profiles?.status === "active" ? "⏸" : "↺"}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default AdminStudents;
