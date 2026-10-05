import React, { useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { uploadDocument, listMyDocuments, getDocumentUrl, deleteDocument } from "../../lib/storage";
import { friendlyError } from "../../lib/errors";

const CATEGORIES = ["ID Proof", "Certificate", "Fee Receipt", "Assignment", "Other"];
const REQUIRED_BY_ROLE = {
  student: ["ID Proof", "Certificate"],
  parent: ["ID Proof"],
  teacher: ["ID Proof", "Certificate"],
  admin: [],
};

function Documents() {
  const { user, role } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await listMyDocuments(user.id);
      setFiles(data);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await uploadDocument(user.id, file, category);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleView = async (path) => {
    try {
      const url = await getDocumentUrl(path);
      window.open(url, "_blank");
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const handleDelete = async (path) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      await deleteDocument(path);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const required = REQUIRED_BY_ROLE[role] || [];
  const uploadedCategories = new Set(files.map((f) => f.category));

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>My documents</h1>
          <p className="lede">Upload by category — only you and admins can see these.</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="button primary-button" style={{ cursor: "pointer" }}>
            {uploading ? "Uploading…" : "+ Upload"}
            <input type="file" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
          </label>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {required.length > 0 && (
        <div className="module-grid" style={{ marginBottom: "20px" }}>
          {required.map((r) => (
            <div key={r} className={`module-card ${uploadedCategories.has(r) ? "accent-green" : "accent-coral"}`}>
              <div className="module-card-top">
                <h3>{r}</h3>
              </div>
              <p>{uploadedCategories.has(r) ? "Uploaded" : "Still needed"}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="lede">Loading…</p>
      ) : files.length === 0 ? (
        <p className="lede">No documents uploaded yet.</p>
      ) : (
        <div className="student-list">
          {files.map((f) => (
            <div className="recent-row" key={f.path}>
              <span className="student-summary">
                <strong>{f.displayName}</strong>
                <small>
                  {f.category} · {f.metadata?.size ? `${Math.round(f.metadata.size / 1024)} KB` : ""}
                </small>
              </span>
              <button className="text-link" type="button" onClick={() => handleView(f.path)}>
                View
              </button>
              <button className="delete-button" type="button" onClick={() => handleDelete(f.path)} title="Delete">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Documents;
