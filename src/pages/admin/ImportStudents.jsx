import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { parseCSV } from "../../lib/csv";
import { createStudent } from "../../lib/queries/students";
import { listClasses } from "../../lib/queries/classes";

const SAMPLE =
  "fullName,email,rollNo,className,section,dob,gender,address\nAarav Sharma,aarav1@example.com,10A-021,10,A,2011-04-12,male,Lucknow";

function passwordFor(fullName) {
  const first = (fullName || "Student").trim().split(" ")[0];
  return first.charAt(0).toUpperCase() + first.slice(1) + "1234";
}

function ImportStudents() {
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState([]);
  const [classes, setClasses] = useState([]);
  const [results, setResults] = useState([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listClasses().then(setClasses).catch(() => {});
  }, []);

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
      const matchClass = classes.find(
        (c) => c.name === row.className && c.section === row.section
      );
      const password = passwordFor(row.fullName);
      try {
        await createStudent({
          fullName: row.fullName,
          email: row.email,
          password,
          rollNo: row.rollNo,
          classId: matchClass?.id || "",
          dob: row.dob,
          gender: row.gender,
          address: row.address,
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
          <p className="eyebrow">Student directory</p>
          <h1>Bulk import students</h1>
          <p className="lede">Paste or upload a CSV — one row per student.</p>
        </div>
        <Link className="text-link" to="/students">
          ← Back to directory
        </Link>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="student-form">
        <p className="eyebrow">Format</p>
        <p className="lede" style={{ marginBottom: "10px" }}>
          Header row required, exactly these columns (className/section must match an existing class, or the student is
          created unassigned):
        </p>
        <pre style={{ background: "var(--surface-2)", padding: "12px", fontSize: "12px", overflowX: "auto" }}>{SAMPLE}</pre>

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
                  {r.email} · {r.className}-{r.section}
                </small>
              </span>
            </div>
          ))}
          <div className="form-actions" style={{ padding: "16px 0" }}>
            <button className="button primary-button" type="button" onClick={handleImport} disabled={importing}>
              {importing ? "Importing…" : `Import ${rows.length} students`}
            </button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="student-list" style={{ marginTop: "20px" }}>
          <p className="eyebrow">Results — share each password with the student</p>
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

export default ImportStudents;
