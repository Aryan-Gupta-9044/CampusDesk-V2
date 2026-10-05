import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createStudent, findParentByEmail, setStudentParent, createParentAndLink } from "../../lib/queries/students";
import { listClasses } from "../../lib/queries/classes";
import { generateRollNo } from "../../lib/idGenerator";
import IdConfirmModal from "../../components/IdConfirmModal";
import { friendlyError } from "../../lib/errors";

const emptyStudentForm = {
  fullName: "",
  email: "",
  password: "",
  classId: "",
  dob: "",
  gender: "",
  address: "",
};

const emptyParentForm = { fullName: "", email: "", password: "" };

function AddStudent() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(emptyStudentForm);

  // "none" | "existing" | "new"
  const [parentMode, setParentMode] = useState("none");
  const [existingParentEmail, setExistingParentEmail] = useState("");
  const [parentForm, setParentForm] = useState(emptyParentForm);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    listClasses()
      .then(setClasses)
      .catch((err) => setError(friendlyError(err)));
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleParentChange = (event) => {
    const { name, value } = event.target;
    setParentForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.fullName.trim() || !form.email.trim() || form.password.length < 6) {
      setError("Full name, email, and a password of at least 6 characters are required.");
      return;
    }
    if (parentMode === "existing" && !existingParentEmail.trim()) {
      setError("Enter the existing parent's email, or switch to \"No parent link\".");
      return;
    }
    if (parentMode === "new" && (!parentForm.fullName.trim() || !parentForm.email.trim() || parentForm.password.length < 6)) {
      setError("Parent full name, email, and a password of at least 6 characters are required to create a new parent account.");
      return;
    }

    setSubmitting(true);
    try {
      let rollNo = "";
      if (form.classId) {
        const cls = classes.find((c) => c.id === form.classId);
        rollNo = await generateRollNo(form.classId, cls.name, cls.section);
      } else {
        rollNo = `UNA-${Date.now().toString().slice(-6)}`;
      }

      const studentId = await createStudent({ ...form, rollNo });

      if (parentMode === "existing") {
        const parent = await findParentByEmail(existingParentEmail.trim());
        if (!parent) {
          setError(
            "Student was created, but no parent account exists with that email. Go to the student's detail page to link one once they've signed up, or come back here next time and create a new parent account instead."
          );
          setSubmitting(false);
          return;
        }
        await setStudentParent(studentId, parent.id);
      } else if (parentMode === "new") {
        await createParentAndLink(studentId, parentForm);
      }

      setConfirmation({
        title: "Student created",
        rows: [
          { label: "Name", value: form.fullName },
          { label: "Roll number", value: rollNo },
          { label: "Login email", value: form.email },
          { label: "Temporary password", value: form.password },
        ],
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page form-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Student directory</p>
          <h1>Add a student</h1>
          <p className="lede">Creates a login account for the student as well as their record.</p>
        </div>
        <Link className="text-link" to="/students">
          ← Back to directory
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="student-form">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="form-grid">
          <label>
            Full name
            <input name="fullName" value={form.fullName} onChange={handleChange} required />
          </label>
          <label>
            Email
            <input type="email" name="email" value={form.email} onChange={handleChange} required />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              minLength={6}
              required
            />
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
            <input type="date" name="dob" value={form.dob} onChange={handleChange} />
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

        <p className="lede" style={{ marginTop: "-10px" }}>
          Share this email and temporary password with the student directly — they can log in right away.
        </p>

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: "18px", marginTop: "6px" }}>
          <p className="eyebrow">Parent account</p>

          <label style={{ display: "flex", gap: "18px", marginBottom: "16px", fontWeight: "normal" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="radio"
                name="parentMode"
                checked={parentMode === "none"}
                onChange={() => setParentMode("none")}
              />
              No parent link
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="radio"
                name="parentMode"
                checked={parentMode === "existing"}
                onChange={() => setParentMode("existing")}
              />
              Link an existing parent
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="radio"
                name="parentMode"
                checked={parentMode === "new"}
                onChange={() => setParentMode("new")}
              />
              Create a new parent account
            </span>
          </label>

          {parentMode === "existing" && (
            <div className="form-grid">
              <label>
                Parent's email
                <input
                  type="email"
                  value={existingParentEmail}
                  onChange={(e) => setExistingParentEmail(e.target.value)}
                  placeholder="Must already have an account"
                />
              </label>
            </div>
          )}

          {parentMode === "new" && (
            <div className="form-grid">
              <label>
                Parent full name
                <input name="fullName" value={parentForm.fullName} onChange={handleParentChange} />
              </label>
              <label>
                Parent email
                <input type="email" name="email" value={parentForm.email} onChange={handleParentChange} />
              </label>
              <label>
                Parent temporary password
                <input
                  type="password"
                  name="password"
                  value={parentForm.password}
                  onChange={handleParentChange}
                  minLength={6}
                />
              </label>
            </div>
          )}
        </div>

        <div className="form-actions">
          <Link className="button secondary-button" to="/students">
            Cancel
          </Link>
          <button className="button primary-button" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Add student"}
          </button>
        </div>
      </form>

      {confirmation && (
        <IdConfirmModal
          title={confirmation.title}
          rows={confirmation.rows}
          onClose={() => navigate("/students")}
        />
      )}
    </div>
  );
}

export default AddStudent;
