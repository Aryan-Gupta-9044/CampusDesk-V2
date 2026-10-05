import React, { useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { listExamsForTeacher, listMySubjectsForClass, listMarksRoster, saveMarks, listMyResults } from "../../lib/queries/exams";
import { getStudentIdForParent } from "../../lib/queries/me";
import { friendlyError } from "../../lib/errors";

function TeacherMarks({ userId }) {
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState("");
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listExamsForTeacher(userId).then(setExams).catch((err) => setError(friendlyError(err)));
  }, [userId]);

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  useEffect(() => {
    if (!selectedExam) return;
    setSubjectId("");
    setRoster([]);
    listMySubjectsForClass(userId, selectedExam.class_id).then(setSubjects).catch((err) => setError(friendlyError(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExamId]);

  useEffect(() => {
    if (!selectedExam || !subjectId) return;
    setLoading(true);
    setSaved(false);
    listMarksRoster(selectedExamId, selectedExam.class_id, subjectId)
      .then(setRoster)
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const updateMark = (studentId, field, value) => {
    setRoster((prev) => prev.map((r) => (r.id === studentId ? { ...r, [field]: value } : r)));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await saveMarks(selectedExamId, subjectId, roster, userId);
      setSaved(true);
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
          <p className="eyebrow">Academics</p>
          <h1>Enter marks</h1>
          <p className="lede">Pick an exam and subject you teach, then fill in marks.</p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="toolbar">
        <select value={selectedExamId} onChange={(e) => setSelectedExamId(e.target.value)}>
          <option value="">Select exam</option>
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.classes?.name}-{e.classes?.section} · {e.name}
            </option>
          ))}
        </select>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!selectedExam}>
          <option value="">Select subject</option>
          {subjects.map((s) => (
            <option key={s.subject_id} value={s.subject_id}>
              {s.subjects?.name}
            </option>
          ))}
        </select>
      </div>

      {!subjectId ? (
        <p className="lede">Choose an exam and subject to load the roster.</p>
      ) : loading ? (
        <p className="lede">Loading…</p>
      ) : (
        <>
          <div className="student-list">
            {roster.map((s) => (
              <div className="student-card" key={s.id} style={{ gridTemplateColumns: "38px 1.4fr 90px 90px" }}>
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
                <input
                  type="number"
                  min="0"
                  value={s.marksObtained}
                  onChange={(e) => updateMark(s.id, "marksObtained", e.target.value)}
                  placeholder="Marks"
                  style={{ border: "1px solid var(--line)", padding: "8px" }}
                />
                <input
                  type="number"
                  min="1"
                  value={s.maxMarks}
                  onChange={(e) => updateMark(s.id, "maxMarks", e.target.value)}
                  placeholder="Max"
                  style={{ border: "1px solid var(--line)", padding: "8px" }}
                />
              </div>
            ))}
          </div>
          <div className="form-actions">
            {saved && <span className="lede">Saved.</span>}
            <button className="button primary-button" type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save marks"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function OwnResults({ studentId, heading }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!studentId) return;
    listMyResults(studentId)
      .then(setResults)
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoading(false));
  }, [studentId]);

  const handlePrint = () => window.print();

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h1>{heading}</h1>
          <p className="lede">Published results only.</p>
        </div>
        {results.length > 0 && (
          <button className="button secondary-button no-print" type="button" onClick={handlePrint}>
            Print report card
          </button>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="lede">Loading…</p>
      ) : results.length === 0 ? (
        <p className="lede">No published results yet.</p>
      ) : (
        <div className="student-list print-area">
          <p className="eyebrow">{heading} — report card</p>
          {results.map((r) => (
            <div className="recent-row" key={r.id}>
              <span className="student-summary">
                <strong>{r.exams?.name}</strong>
                <small>{r.exams?.term}</small>
              </span>
              <span className="course-cell">
                <strong>{r.percentage}%</strong>
                <small>
                  Grade {r.grade} · Rank #{r.rank}
                </small>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Results() {
  const { role, user } = useAuth();
  const [linkedStudentId, setLinkedStudentId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (role === "parent") {
      getStudentIdForParent(user.id).then(setLinkedStudentId).catch((err) => setError(friendlyError(err)));
    }
  }, [role, user]);

  if (role === "teacher") return <TeacherMarks userId={user.id} />;
  if (role === "student") return <OwnResults studentId={user.id} heading="My marks & results" />;
  if (role === "parent") {
    if (error) return <p className="form-error page">{error}</p>;
    if (!linkedStudentId)
      return (
        <div className="page">
          <p className="lede">Not linked to a child's account yet. Ask your school's administrator to set the link.</p>
        </div>
      );
    return <OwnResults studentId={linkedStudentId} heading="Child's marks & results" />;
  }
  return null;
}

export default Results;
