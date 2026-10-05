import React, { useState } from "react";
import { Link } from "react-router-dom";

import { parseCSV } from "../../lib/csv";
import { createTeacher } from "../../lib/queries/teachers";

const SAMPLE =
  "fullName,email,employeeId,department,qualification,joiningDate\nAnita Sharma,anita.s@example.com,EMP-011,Mathematics,M.Ed,2024-06-01";

function passwordFor(fullName) {
  const first = (fullName || "Teacher").trim().split(" ")[0];
  return first.charAt(0).toUpperCase() + first.slice(1) + "1234";
}

function ImportTeachers() {
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState([]);
  const [results, setResults] = useState([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const handlePreview = () => {
    setError("");
    setResults([]);
    try {
      const parsed = parseCSV(csvText);
      if (parsed.length === 0) {
        setError("No rows found. Make sure the first line is a header row.");
        return;
      }
      setRows(parsed);
    } catch (err) {
      setError("Couldn't parse that — check it's plain comma-separated text.");
    }
  };

  const handleFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setCsvText(e.target.result);
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    const outcomes = [];
    for (const row of rows) {
      const password = passwordFor(row.fullName);
      try {
        await createTeacher({
          fullName: row.fullName,
          email: row.email,
          password,
          employeeId: row.employeeId,
          department: row.department,
          qualification: row.qualification,
          joiningDate: row.joiningDate,
        });
        outcomes.push({ ...row, password, status: "created" });
      } catch (err) {
        outcomes.push({ ...row, password, status: `failed: ${err.message}` });
      }
    }
    setResults(outcomes);
    setImporting(false);
  };

  return (
    <div className="page form-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Faculty</p>
          <h1>Bulk import teachers</h1>
          <p className="lede">Paste or upload a CSV — one row per teacher.</p>
        </div>
        <Link className="text-link" to="/teachers">
          ← Back to faculty
        </Link>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="student-form">
        <p className="eyebrow">Format</p>
        <pre style={{ background: "#f6f7f5", padding: "12px", fontSize: "12px", overflowX: "auto" }}>{SAMPLE}</pre>

        <label style={{ display: "block", marginTop: "16px" }}>
          Upload a .csv file
          <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "block", marginTop: "6px" }} />
        </label>

        <label style={{ display: "block", marginTop: "16px" }}>
          Or paste CSV text
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={8}
            style={{ width: "100%", border: "1px solid var(--line)", padding: "10px", fontFamily: "monospace", fontSize: "12px" }}
          />
        </label>

        <div className="form-actions">
          <button className="button secondary-button" type="button" onClick={handlePreview}>
            Preview
          </button>
        </div>
      </div>

      {rows.length > 0 && results.length === 0 && (
        <div className="student-list" style={{ marginTop: "20px" }}>
          <p className="eyebrow">Preview — {rows.length} rows</p>
          {rows.map((r, i) => (
            <div className="recent-row" key={i}>
              <span className="student-summary">
                <strong>{r.fullName}</strong>
                <small>
                  {r.email} · {r.department}
                </small>
              </span>
            </div>
          ))}
          <div className="form-actions" style={{ padding: "16px 0" }}>
            <button className="button primary-button" type="button" onClick={handleImport} disabled={importing}>
              {importing ? "Importing…" : `Import ${rows.length} teachers`}
            </button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="student-list" style={{ marginTop: "20px" }}>
          <p className="eyebrow">Results — share each password with the teacher</p>
          {results.map((r, i) => (
            <div className="recent-row" key={i}>
              <span className="student-summary">
                <strong>{r.fullName}</strong>
                <small>
                  {r.email} · password: {r.password}
                </small>
              </span>
              <span className={`status ${r.status === "created" ? "status-active" : "status-leave"}`}>
                <span className="dot"></span>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ImportTeachers;
