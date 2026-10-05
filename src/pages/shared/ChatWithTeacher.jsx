import React, { useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { getStudent } from "../../lib/queries/students";
import { getStudentIdForParent } from "../../lib/queries/me";
import { listTeachersForClass, createQuery, listMySentQueries, listQueriesForTeacher, replyToQuery } from "../../lib/queries/teacherQueries";
import { friendlyError } from "../../lib/errors";

const QUERY_TYPES = ["Academic", "Attendance", "Fees", "Behavior", "General"];

function ComposeAndSent({ studentId, senderId, senderRole }) {
  const [teachers, setTeachers] = useState([]);
  const [sent, setSent] = useState([]);
  const [form, setForm] = useState({ teacherId: "", queryType: "General", message: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await listMySentQueries(senderId);
      setSent(data);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const student = await getStudent(studentId);
        if (student.class_id) {
          const t = await listTeachersForClass(student.class_id);
          setTeachers(t);
        }
      } catch (err) {
        setError(friendlyError(err));
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.teacherId || !form.message.trim()) {
      setError("Pick a teacher and write a short message.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await createQuery({
        studentId,
        senderId,
        senderRole,
        teacherId: form.teacherId,
        queryType: form.queryType,
        message: form.message,
      });
      setForm({ teacherId: "", queryType: "General", message: "" });
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Communication</p>
          <h1>Chat with a teacher</h1>
          <p className="lede">Send a quick query — pick the teacher, a topic, and a short message.</p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <form onSubmit={handleSubmit} className="student-form">
        <div className="form-grid">
          <label>
            Teacher
            <select name="teacherId" value={form.teacherId} onChange={handleChange} required>
              <option value="">Select teacher</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.subjects.filter(Boolean).join(", ")})
                </option>
              ))}
            </select>
          </label>
          <label>
            Query type
            <select name="queryType" value={form.queryType} onChange={handleChange}>
              {QUERY_TYPES.map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </label>
        </div>
        <label style={{ display: "block", marginBottom: "12px" }}>
          Message
          <textarea
            name="message"
            value={form.message}
            onChange={handleChange}
            rows={3}
            maxLength={500}
            style={{ width: "100%", border: "1px solid var(--line)", padding: "10px", font: "13px Arial, sans-serif" }}
          />
        </label>
        <div className="form-actions">
          <button className="button primary-button" type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </form>

      <p className="eyebrow" style={{ marginTop: "24px" }}>
        Your queries
      </p>
      {loading ? (
        <p className="lede">Loading…</p>
      ) : sent.length === 0 ? (
        <p className="lede">No queries sent yet.</p>
      ) : (
        <div className="student-list">
          {sent.map((q) => (
            <div className="recent-row" key={q.id} style={{ alignItems: "flex-start" }}>
              <span className="student-summary">
                <strong>
                  {q.query_type} — to {q.teachers?.profiles?.full_name}
                </strong>
                <small>{q.message}</small>
                {q.reply && (
                  <p style={{ margin: "8px 0 0", padding: "8px", background: "#f6f7f5", fontSize: "12px" }}>
                    <strong>Reply:</strong> {q.reply}
                  </p>
                )}
              </span>
              <span className={`status ${q.status === "answered" ? "status-active" : "status-leave"}`}>
                <span className="dot"></span>
                {q.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeacherInbox({ teacherId }) {
  const [queries, setQueries] = useState([]);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await listQueriesForTeacher(teacherId);
      setQueries(data);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  const handleReply = async (id) => {
    const reply = replyDrafts[id];
    if (!reply?.trim()) return;
    try {
      await replyToQuery(id, reply);
      setReplyDrafts((prev) => ({ ...prev, [id]: "" }));
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Communication</p>
          <h1>Student & parent queries</h1>
          <p className="lede">Questions sent to you, newest first.</p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="lede">Loading…</p>
      ) : queries.length === 0 ? (
        <p className="lede">No queries yet.</p>
      ) : (
        <div className="student-list">
          {queries.map((q) => (
            <div className="recent-row" key={q.id} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
              <span className="student-summary">
                <strong>
                  {q.query_type} · {q.students?.profiles?.full_name} ({q.sender_role})
                </strong>
                <small>{q.message}</small>
                {q.reply && (
                  <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "12px" }}>
                    <strong>Your reply:</strong> {q.reply}
                  </p>
                )}
              </span>
              {q.status === "open" && (
                <div style={{ flexBasis: "100%", display: "flex", gap: "8px", marginTop: "8px" }}>
                  <input
                    placeholder="Write a reply…"
                    value={replyDrafts[q.id] || ""}
                    onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    style={{ flex: 1, border: "1px solid var(--line)", padding: "8px" }}
                  />
                  <button className="button secondary-button" type="button" onClick={() => handleReply(q.id)}>
                    Reply
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatWithTeacher() {
  const { role, user } = useAuth();
  const [linkedStudentId, setLinkedStudentId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (role === "parent") {
      getStudentIdForParent(user.id).then(setLinkedStudentId).catch((err) => setError(friendlyError(err)));
    }
  }, [role, user]);

  if (role === "teacher") return <TeacherInbox teacherId={user.id} />;
  if (role === "student") return <ComposeAndSent studentId={user.id} senderId={user.id} senderRole="student" />;
  if (role === "parent") {
    if (error) return <p className="form-error page">{error}</p>;
    if (!linkedStudentId)
      return (
        <div className="page">
          <p className="lede">Not linked to a child's account yet. Ask your school's administrator to set the link.</p>
        </div>
      );
    return <ComposeAndSent studentId={linkedStudentId} senderId={user.id} senderRole="parent" />;
  }
  return (
    <div className="page">
      <p className="lede">Not applicable to your account.</p>
    </div>
  );
}

export default ChatWithTeacher;
