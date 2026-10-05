import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getStudentWithParent, updateStudent, setStudentStatus, findParentByEmail, setStudentParent, createParentAndLink } from "../../lib/queries/students";
import { listClasses } from "../../lib/queries/classes";
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

function StudentDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [student, setStudent] = useState(null);
  const [classes, setClasses] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getStudentWithParent(id);
      setStudent(data);
      setForm({
        fullName: data.profiles?.full_name || "",
        rollNo: data.roll_no || "",
        classId: data.class_id || "",
        dob: data.dob || "",
        gender: data.gender || "",
        address: data.address || "",
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    listClasses().then(setClasses).catch(() => {});
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
      await updateStudent(id, form);
      setEditing(false);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    const nextStatus = student.profiles?.status === "active" ? "suspended" : "active";
    const verb = nextStatus === "suspended" ? "Suspend" : "Reactivate";
    if (!window.confirm(`${verb} ${student.profiles?.full_name}?`)) return;
    try {
      await setStudentStatus(id, nextStatus);
      await logAction(user.id, nextStatus === "suspended" ? "suspend_student" : "reactivate_student", "students", id, {
        name: student.profiles?.full_name,
      });
      load();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const [parentMode, setParentMode] = useState("existing");
  const [parentEmail, setParentEmail] = useState("");
  const [newParentForm, setNewParentForm] = useState({ fullName: "", email: "", password: "" });
  const [linkingParent, setLinkingParent] = useState(false);

  const handleNewParentChange = (event) => {
    const { name, value } = event.target;
    setNewParentForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLinkParent = async (event) => {
    event.preventDefault();
    setError("");
    setLinkingParent(true);
    try {
      if (parentMode === "existing") {
        if (!parentEmail.trim()) {
          setError("Enter the parent's email.");
          return;
        }
        const parent = await findParentByEmail(parentEmail.trim());
        if (!parent) {
          setError("No parent account found with that email. They need to sign up first, or switch to \"Create new\".");
          return;
        }
        await setStudentParent(id, parent.id);
        setParentEmail("");
      } else {
        if (!newParentForm.fullName.trim() || !newParentForm.email.trim() || newParentForm.password.length < 6) {
          setError("Parent full name, email, and a password of at least 6 characters are required.");
          return;
        }
        await createParentAndLink(id, newParentForm);
        setNewParentForm({ fullName: "", email: "", password: "" });
      }
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLinkingParent(false);
    }
  };

  const handleUnlinkParent = async () => {
    if (!window.confirm(`Unlink ${student.parent?.full_name} from ${student.profiles?.full_name}?`)) return;
    try {
      await setStudentParent(id, null);
      await logAction(user.id, "unlink_parent", "students", id, { previous_parent: student.parent?.email });
      await load();
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

  if (!student) {
    return (
      <div className="page">
        <h1>Student not found</h1>
        <Link to="/students">Back to Students</Link>
      </div>
    );
  }

  return (
    <div className="page details-page">
      <Link className="text-link" to="/students">
        ← Back to directory
      </Link>

      <div className="profile-header">
        <span className="profile-avatar">{initials(student.profiles?.full_name)}</span>
        <div>
          <p className="eyebrow">Student profile</p>
          <h1>{student.profiles?.full_name}</h1>
          <p className="lede">
            {student.classes ? `${student.classes.name}-${student.classes.section}` : "Unassigned class"} · Roll no.{" "}
            {student.roll_no || "—"}
          </p>
        </div>
        <span className={`status ${student.profiles?.status === "active" ? "status-active" : "status-leave"}`}>
          <span className="dot"></span>
          {student.profiles?.status === "active" ? "Active" : "Suspended"}
        </span>
      </div>

      {error && <p className="form-error">{error}</p>}

      {!editing ? (
        <>
          <div className="details-card">
            <p className="eyebrow">Student information</p>
            <div className="detail-item">
              <small>Email address</small>
              <strong>{student.profiles?.email}</strong>
            </div>
            <div className="detail-item">
              <small>Roll number</small>
              <strong>{student.roll_no || "—"}</strong>
            </div>
            <div className="detail-item">
              <small>Class</small>
              <strong>{student.classes ? `${student.classes.name}-${student.classes.section}` : "Unassigned"}</strong>
            </div>
            <div className="detail-item">
              <small>Date of birth</small>
              <strong>{student.dob || "—"}</strong>
            </div>
            <div className="detail-item">
              <small>Gender</small>
              <strong>{student.gender || "—"}</strong>
            </div>
            <div className="detail-item">
              <small>Address</small>
              <strong>{student.address || "—"}</strong>
            </div>
            <div className="detail-item">
              <small>Admission date</small>
              <strong>{student.admission_date || "—"}</strong>
            </div>
          </div>

          <div className="details-card">
            <p className="eyebrow">Parent link</p>
            <div style={{ padding: "0 26px 20px" }}>
              {student.parent ? (
                <p className="lede">
                  Currently linked to <strong>{student.parent.full_name}</strong> ({student.parent.email}) ·{" "}
                  <button
                    className="text-link"
                    type="button"
                    onClick={handleUnlinkParent}
                    style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0 }}
                  >
                    Unlink
                  </button>
                </p>
              ) : (
                <p className="lede">No parent linked yet.</p>
              )}

              <label style={{ display: "flex", gap: "18px", margin: "12px 0", fontWeight: "normal" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="radio"
                    name="detailParentMode"
                    checked={parentMode === "existing"}
                    onChange={() => setParentMode("existing")}
                  />
                  Link an existing parent
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="radio"
                    name="detailParentMode"
                    checked={parentMode === "new"}
                    onChange={() => setParentMode("new")}
                  />
                  Create a new parent account
                </span>
              </label>

              <form onSubmit={handleLinkParent} className="toolbar">
                {parentMode === "existing" ? (
                  <input
                    type="email"
                    placeholder="Parent's account email"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    style={{ flex: 1, border: "1px solid var(--line)", padding: "10px 12px" }}
                  />
                ) : (
                  <>
                    <input
                      name="fullName"
                      placeholder="Parent full name"
                      value={newParentForm.fullName}
                      onChange={handleNewParentChange}
                      style={{ flex: 1, border: "1px solid var(--line)", padding: "10px 12px" }}
                    />
                    <input
                      type="email"
                      name="email"
                      placeholder="Parent email"
                      value={newParentForm.email}
                      onChange={handleNewParentChange}
                      style={{ flex: 1, border: "1px solid var(--line)", padding: "10px 12px" }}
                    />
                    <input
                      type="password"
                      name="password"
                      placeholder="Temporary password"
                      value={newParentForm.password}
                      onChange={handleNewParentChange}
                      minLength={6}
                      style={{ flex: 1, border: "1px solid var(--line)", padding: "10px 12px" }}
                    />
                  </>
                )}
                <button className="button secondary-button" type="submit" disabled={linkingParent}>
                  {linkingParent ? "Saving…" : parentMode === "existing" ? "Link parent" : "Create & link"}
                </button>
              </form>
            </div>
          </div>

          <div className="form-actions">
            <Link className="button secondary-button" to={`/students/${id}/report`}>
              View full report
            </Link>
            <button className="button secondary-button" type="button" onClick={handleToggleStatus}>
              {student.profiles?.status === "active" ? "Suspend student" : "Reactivate student"}
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
              Roll number
              <input name="rollNo" value={form.rollNo} onChange={handleChange} />
            </label>
            <label>
              Class
              <select name="classId" value={form.classId} onChange={handleChange}>
                <option value="">Unassigned</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}-{c.section} ({c.academic_year})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date of birth
              <input type="date" name="dob" value={form.dob || ""} onChange={handleChange} />
            </label>
            <label>
              Gender
              <select name="gender" value={form.gender} onChange={handleChange}>
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Address
              <input name="address" value={form.address} onChange={handleChange} />
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

export default StudentDetail;
