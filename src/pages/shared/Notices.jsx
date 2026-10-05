import React, { useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { listNotices, createNotice, deleteNotice } from "../../lib/queries/notices";
import { listClasses } from "../../lib/queries/classes";
import { friendlyError } from "../../lib/errors";

const emptyForm = { title: "", content: "", targetRole: "all", targetClassId: "", pinned: false, expiryDate: "" };

function Notices() {
  const { role } = useAuth();
  const [notices, setNotices] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);

  const canPost = role === "admin" || role === "teacher";

  const load = async () => {
    setLoading(true);
    try {
      const data = await listNotices();
      setNotices(data);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (canPost) listClasses().then(setClasses).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Give the notice a title.");
      return;
    }
    setPosting(true);
    setError("");
    try {
      await createNotice(form);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (notice) => {
    if (!window.confirm(`Delete notice "${notice.title}"?`)) return;
    try {
      await deleteNotice(notice.id);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Notices</p>
          <h1>Announcements</h1>
          <p className="lede">Pinned notices appear first.</p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="lede">Loading…</p>
      ) : notices.length === 0 ? (
        <p className="lede">No notices yet.</p>
      ) : (
        <div className="student-list">
          {notices.map((n) => (
            <div className="recent-row" key={n.id} style={{ alignItems: "flex-start" }}>
              <span className="student-summary">
                <strong>
                  {n.pinned && "📌 "}
                  {n.title}
                </strong>
                <small>
                  {n.classes ? `${n.classes.name}-${n.classes.section}` : "All classes"} ·{" "}
                  {new Date(n.created_at).toLocaleDateString()}
                  {n.expiry_date ? ` · expires ${n.expiry_date}` : ""}
                </small>
                {n.content && <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "12px" }}>{n.content}</p>}
              </span>
              {role === "admin" && (
                <button className="delete-button" type="button" onClick={() => handleDelete(n)} title="Delete">
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canPost && (
        <form onSubmit={handleSubmit} className="student-form" style={{ marginTop: "24px" }}>
          <p className="eyebrow">Post a notice</p>
          <div className="form-grid">
            <label>
              Title
              <input name="title" value={form.title} onChange={handleChange} required />
            </label>
            <label>
              Audience
              <select name="targetRole" value={form.targetRole} onChange={handleChange}>
                <option value="all">Everyone</option>
                <option value="students">Students</option>
                <option value="teachers">Teachers</option>
              </select>
            </label>
            <label>
              Class (optional)
              <select name="targetClassId" value={form.targetClassId} onChange={handleChange}>
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}-{c.section}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Expiry date (optional)
              <input type="date" name="expiryDate" value={form.expiryDate} onChange={handleChange} />
            </label>
          </div>
          <label style={{ display: "block", marginBottom: "12px" }}>
            Content
            <textarea
              name="content"
              value={form.content}
              onChange={handleChange}
              rows={3}
              style={{ width: "100%", border: "1px solid var(--line)", padding: "10px", font: "13px Arial, sans-serif" }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <input type="checkbox" name="pinned" checked={form.pinned} onChange={handleChange} />
            Pin to top
          </label>
          <div className="form-actions">
            <button type="submit" className="button primary-button" disabled={posting}>
              {posting ? "Posting…" : "Post notice"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default Notices;
