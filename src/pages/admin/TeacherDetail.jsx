import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getTeacher, updateTeacher, setTeacherStatus } from "../../lib/queries/teachers";
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

function TeacherDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [teacher, setTeacher] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getTeacher(id);
      setTeacher(data);
      setForm({
        fullName: data.profiles?.full_name || "",
        employeeId: data.employee_id || "",
        department: data.department || "",
        qualification: data.qualification || "",
        joiningDate: data.joining_date || "",
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await updateTeacher(id, form);
      setEditing(false);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    const nextStatus = teacher.profiles?.status === "active" ? "suspended" : "active";
    const verb = nextStatus === "suspended" ? "Suspend" : "Reactivate";
    if (!window.confirm(`${verb} ${teacher.profiles?.full_name}?`)) return;
    try {
      await setTeacherStatus(id, nextStatus);
      await logAction(user.id, nextStatus === "suspended" ? "suspend_teacher" : "reactivate_teacher", "teachers", id, {
        name: teacher.profiles?.full_name,
      });
      load();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  if (loading) {
    return (
      <div className="page">
        <p className="lede">Loading…</p>
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="page">
        <h1>Teacher not found</h1>
        <Link to="/teachers">Back to Teachers</Link>
      </div>
    );
  }

  return (
    <div className="page details-page">
      <Link className="text-link" to="/teachers">
        ← Back to faculty
      </Link>

      <div className="profile-header">
        <span className="profile-avatar">{initials(teacher.profiles?.full_name)}</span>
        <div>
          <p className="eyebrow">Teacher profile</p>
          <h1>{teacher.profiles?.full_name}</h1>
          <p className="lede">{teacher.department || "No department set"} · ID {teacher.employee_id || "—"}</p>
        </div>
        <span className={`status ${teacher.profiles?.status === "active" ? "status-active" : "status-leave"}`}>
          <span className="dot"></span>
          {teacher.profiles?.status === "active" ? "Active" : "Suspended"}
        </span>
      </div>

      {error && <p className="form-error">{error}</p>}

      {!editing ? (
        <>
          <div className="details-card">
            <p className="eyebrow">Faculty information</p>
            <div className="detail-item">
              <small>Email address</small>
              <strong>{teacher.profiles?.email}</strong>
            </div>
            <div className="detail-item">
              <small>Employee ID</small>
              <strong>{teacher.employee_id || "—"}</strong>
            </div>
            <div className="detail-item">
              <small>Department</small>
              <strong>{teacher.department || "—"}</strong>
            </div>
            <div className="detail-item">
              <small>Qualification</small>
              <strong>{teacher.qualification || "—"}</strong>
            </div>
            <div className="detail-item">
              <small>Joining date</small>
              <strong>{teacher.joining_date || "—"}</strong>
            </div>
          </div>

          <div className="form-actions">
            <Link className="button secondary-button" to={`/teachers/${id}/report`}>
              View full report
            </Link>
            <button className="button secondary-button" type="button" onClick={handleToggleStatus}>
              {teacher.profiles?.status === "active" ? "Suspend teacher" : "Reactivate teacher"}
            </button>
            <button className="button primary-button" type="button" onClick={() => setEditing(true)}>
              Edit details
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={handleSave} className="student-form">
          <div className="form-grid">
            <label>
              Full name
              <input name="fullName" value={form.fullName} onChange={handleChange} required />
            </label>
            <label>
              Employee ID
              <input name="employeeId" value={form.employeeId} onChange={handleChange} />
            </label>
            <label>
              Department
              <input name="department" value={form.department} onChange={handleChange} />
            </label>
            <label>
              Qualification
              <input name="qualification" value={form.qualification} onChange={handleChange} />
            </label>
            <label>
              Joining date
              <input type="date" name="joiningDate" value={form.joiningDate || ""} onChange={handleChange} />
            </label>
          </div>
          <div className="form-actions">
            <button className="button secondary-button" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="button primary-button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default TeacherDetail;
