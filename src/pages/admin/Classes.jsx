import React, { useEffect, useState } from "react";

import {
  listClasses,
  addClass,
  updateClass,
  deleteClass,
  listSubjects,
  addSubject,
  updateSubject,
  deleteSubject,
  listActiveTeachersForDropdown,
  listSubjectTeachers,
  assignTeacherToSubject,
  unassignTeacherFromSubject,
} from "../../lib/queries/classes";
import { friendlyError } from "../../lib/errors";

const emptyClassForm = { name: "", section: "", academicYear: "", classTeacherId: "" };
const emptySubjectForm = { name: "", code: "" };

function Classes() {
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [classForm, setClassForm] = useState(emptyClassForm);
  const [editingClassId, setEditingClassId] = useState(null);
  const [savingClass, setSavingClass] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [subjectForm, setSubjectForm] = useState(emptySubjectForm);
  const [editingSubjectId, setEditingSubjectId] = useState(null);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectTeachers, setSubjectTeachers] = useState({});
  const [assignPickerFor, setAssignPickerFor] = useState(null);
  const [assignTeacherId, setAssignTeacherId] = useState("");

  const loadClasses = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listClasses();
      setClasses(data);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
    listActiveTeachersForDropdown().then(setTeachers).catch(() => {});
  }, []);

  const loadSubjects = async (classId) => {
    setSubjectsLoading(true);
    try {
      const data = await listSubjects(classId);
      setSubjects(data);
      const teacherEntries = await Promise.all(
        data.map(async (subject) => [subject.id, await listSubjectTeachers(subject.id)])
      );
      setSubjectTeachers(Object.fromEntries(teacherEntries));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubjectsLoading(false);
    }
  };

  const handleSelectClass = (classId) => {
    setSelectedClassId(classId);
    setEditingSubjectId(null);
    setSubjectForm(emptySubjectForm);
    loadSubjects(classId);
  };

  const handleClassChange = (event) => {
    const { name, value } = event.target;
    setClassForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleClassSubmit = async (event) => {
    event.preventDefault();
    if (!classForm.name.trim() || !classForm.section.trim() || !classForm.academicYear.trim()) {
      setError("Class name, section, and academic year are required.");
      return;
    }
    setSavingClass(true);
    setError("");
    try {
      if (editingClassId) {
        await updateClass(editingClassId, classForm);
      } else {
        await addClass(classForm);
      }
      setClassForm(emptyClassForm);
      setEditingClassId(null);
      await loadClasses();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSavingClass(false);
    }
  };

  const handleEditClass = (cls) => {
    setEditingClassId(cls.id);
    setClassForm({
      name: cls.name,
      section: cls.section,
      academicYear: cls.academic_year,
      classTeacherId: cls.class_teacher_id || "",
    });
  };

  const handleDeleteClass = async (cls) => {
    if (!window.confirm(`Delete class ${cls.name}-${cls.section}? This also removes its subjects.`)) return;
    try {
      await deleteClass(cls.id);
      if (selectedClassId === cls.id) setSelectedClassId(null);
      await loadClasses();
    } catch (err) {
      setError(
        "Couldn't delete this class — it likely still has students assigned to it. Reassign or remove them first."
      );
    }
  };

  const handleSubjectChange = (event) => {
    const { name, value } = event.target;
    setSubjectForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubjectSubmit = async (event) => {
    event.preventDefault();
    if (!subjectForm.name.trim()) {
      setError("Subject name is required.");
      return;
    }
    setError("");
    try {
      if (editingSubjectId) {
        await updateSubject(editingSubjectId, subjectForm);
      } else {
        await addSubject(selectedClassId, subjectForm);
      }
      setSubjectForm(emptySubjectForm);
      setEditingSubjectId(null);
      await loadSubjects(selectedClassId);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const handleEditSubject = (subject) => {
    setEditingSubjectId(subject.id);
    setSubjectForm({ name: subject.name, code: subject.code || "" });
  };

  const handleDeleteSubject = async (subject) => {
    if (!window.confirm(`Delete subject ${subject.name}?`)) return;
    try {
      await deleteSubject(subject.id);
      await loadSubjects(selectedClassId);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const handleAssignTeacher = async (subject) => {
    if (!assignTeacherId) return;
    try {
      await assignTeacherToSubject(subject.id, selectedClassId, assignTeacherId);
      setAssignPickerFor(null);
      setAssignTeacherId("");
      await loadSubjects(selectedClassId);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const handleUnassignTeacher = async (assignmentId) => {
    try {
      await unassignTeacherFromSubject(assignmentId);
      await loadSubjects(selectedClassId);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Academic structure</p>
          <h1>Classes & subjects</h1>
          <p className="lede">Define classes, sections, and the subjects taught in each.</p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="detail-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Classes</p>
              <h2>{classes.length} defined</h2>
            </div>
          </div>

          {loading ? (
            <p className="lede" style={{ padding: "20px 26px" }}>
              Loading…
            </p>
          ) : classes.length === 0 ? (
            <p className="lede" style={{ padding: "20px 26px" }}>
              No classes yet — add one using the form.
            </p>
          ) : (
            classes.map((cls) => (
              <div
                key={cls.id}
                className="recent-row"
                style={{ cursor: "pointer", background: selectedClassId === cls.id ? "#f6f7f5" : "transparent" }}
                onClick={() => handleSelectClass(cls.id)}
              >
                <span className="student-summary">
                  <strong>
                    {cls.name}-{cls.section}
                  </strong>
                  <small>
                    {cls.academic_year} · Class teacher: {cls.teachers?.profiles?.full_name || "Unassigned"}
                  </small>
                </span>
                <button
                  className="text-link"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditClass(cls);
                  }}
                >
                  Edit
                </button>
                <button
                  className="delete-button"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClass(cls);
                  }}
                  title="Delete class"
                >
                  ×
                </button>
              </div>
            ))
          )}

          <form onSubmit={handleClassSubmit} className="student-form" style={{ boxShadow: "none", borderTop: "1px solid var(--line)" }}>
            <p className="eyebrow" style={{ marginTop: "10px" }}>
              {editingClassId ? "Edit class" : "Add a class"}
            </p>
            <div className="form-grid">
              <label>
                Name
                <input name="name" placeholder="e.g. 10" value={classForm.name} onChange={handleClassChange} required />
              </label>
              <label>
                Section
                <input name="section" placeholder="e.g. A" value={classForm.section} onChange={handleClassChange} required />
              </label>
              <label>
                Academic year
                <input
                  name="academicYear"
                  placeholder="e.g. 2026-27"
                  value={classForm.academicYear}
                  onChange={handleClassChange}
                  required
                />
              </label>
              <label>
                Class teacher
                <select name="classTeacherId" value={classForm.classTeacherId} onChange={handleClassChange}>
                  <option value="">Unassigned</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.profiles?.full_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-actions">
              {editingClassId && (
                <button
                  type="button"
                  className="button secondary-button"
                  onClick={() => {
                    setEditingClassId(null);
                    setClassForm(emptyClassForm);
                  }}
                >
                  Cancel
                </button>
              )}
              <button type="submit" className="button primary-button" disabled={savingClass}>
                {savingClass ? "Saving…" : editingClassId ? "Save changes" : "Add class"}
              </button>
            </div>
          </form>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Subjects</p>
              <h2>{selectedClass ? `${selectedClass.name}-${selectedClass.section}` : "Select a class"}</h2>
            </div>
          </div>

          {!selectedClassId ? (
            <p className="lede" style={{ padding: "20px 26px" }}>
              Click a class on the left to manage its subjects.
            </p>
          ) : subjectsLoading ? (
            <p className="lede" style={{ padding: "20px 26px" }}>
              Loading…
            </p>
          ) : (
            <>
              {subjects.length === 0 ? (
                <p className="lede" style={{ padding: "20px 26px" }}>
                  No subjects yet for this class.
                </p>
              ) : (
                subjects.map((subject) => (
                  <div className="recent-row" key={subject.id} style={{ flexWrap: "wrap" }}>
                    <span className="student-summary">
                      <strong>{subject.name}</strong>
                      <small>{subject.code || "No code"}</small>
                    </span>
                    <button className="text-link" type="button" onClick={() => handleEditSubject(subject)}>
                      Edit
                    </button>
                    <button
                      className="delete-button"
                      type="button"
                      onClick={() => handleDeleteSubject(subject)}
                      title="Delete subject"
                    >
                      ×
                    </button>
                    <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                      {(subjectTeachers[subject.id] || []).map((assignment) => (
                        <span key={assignment.id} className="role-stamp accent-blue role-stamp-sm">
                          {assignment.teachers?.profiles?.full_name}
                          <button
                            type="button"
                            onClick={() => handleUnassignTeacher(assignment.id)}
                            style={{ marginLeft: "6px", border: 0, background: "transparent", cursor: "pointer" }}
                            title="Unassign"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {assignPickerFor === subject.id ? (
                        <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <select value={assignTeacherId} onChange={(e) => setAssignTeacherId(e.target.value)}>
                            <option value="">Select teacher</option>
                            {teachers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.profiles?.full_name}
                              </option>
                            ))}
                          </select>
                          <button className="text-link" type="button" onClick={() => handleAssignTeacher(subject)}>
                            Assign
                          </button>
                        </span>
                      ) : (
                        <button className="text-link" type="button" onClick={() => setAssignPickerFor(subject.id)}>
                          + Assign teacher
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}

              <form onSubmit={handleSubjectSubmit} className="student-form" style={{ boxShadow: "none", borderTop: "1px solid var(--line)" }}>
                <p className="eyebrow" style={{ marginTop: "10px" }}>
                  {editingSubjectId ? "Edit subject" : "Add a subject"}
                </p>
                <div className="form-grid">
                  <label>
                    Name
                    <input name="name" placeholder="e.g. Mathematics" value={subjectForm.name} onChange={handleSubjectChange} required />
                  </label>
                  <label>
                    Code
                    <input name="code" placeholder="e.g. MATH101" value={subjectForm.code} onChange={handleSubjectChange} />
                  </label>
                </div>
                <div className="form-actions">
                  {editingSubjectId && (
                    <button
                      type="button"
                      className="button secondary-button"
                      onClick={() => {
                        setEditingSubjectId(null);
                        setSubjectForm(emptySubjectForm);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                  <button type="submit" className="button primary-button">
                    {editingSubjectId ? "Save changes" : "Add subject"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Classes;
