import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createTeacher } from "../../lib/queries/teachers";
import { generateEmployeeId } from "../../lib/idGenerator";
import IdConfirmModal from "../../components/IdConfirmModal";
import { friendlyError } from "../../lib/errors";

function AddTeacher() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    department: "",
    qualification: "",
    joiningDate: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.fullName.trim() || !form.email.trim() || form.password.length < 6) {
      setError("Full name, email, and a password of at least 6 characters are required.");
      return;
    }

    setSubmitting(true);
    try {
      const employeeId = await generateEmployeeId();
      await createTeacher({ ...form, employeeId });
      setConfirmation({
        title: "Teacher created",
        rows: [
          { label: "Name", value: form.fullName },
          { label: "Employee ID", value: employeeId },
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
          <p className="eyebrow">Faculty</p>
          <h1>Add a teacher</h1>
          <p className="lede">Creates a login account for the teacher as well as their record.</p>
        </div>
        <Link className="text-link" to="/teachers">
          ← Back to faculty
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
            Department
            <input name="department" value={form.department} onChange={handleChange} />
          </label>
          <label>
            Qualification
            <input name="qualification" value={form.qualification} onChange={handleChange} />
          </label>
          <label>
            Joining date
            <input type="date" name="joiningDate" value={form.joiningDate} onChange={handleChange} />
          </label>
        </div>

        <p className="lede" style={{ marginTop: "-10px" }}>
          Employee ID is generated automatically. Share the login email and temporary password with the teacher directly.
        </p>

        <div className="form-actions">
          <Link className="button secondary-button" to="/teachers">
            Cancel
          </Link>
          <button className="button primary-button" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Add teacher"}
          </button>
        </div>
      </form>

      {confirmation && (
        <IdConfirmModal title={confirmation.title} rows={confirmation.rows} onClose={() => navigate("/teachers")} />
      )}
    </div>
  );
}

export default AddTeacher;
