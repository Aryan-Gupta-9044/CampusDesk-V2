import React from "react";

function IdConfirmModal({ title, rows, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(29,53,71,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div style={{ background: "#fff", padding: "28px", maxWidth: "420px", width: "90%" }}>
        <p className="eyebrow">{title}</p>
        <div style={{ marginTop: "10px" }}>
          {rows.map((r) => (
            <div
              key={r.label}
              style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}
            >
              <span style={{ color: "var(--muted)", fontSize: "13px" }}>{r.label}</span>
              <strong style={{ fontSize: "13px" }}>{r.value}</strong>
            </div>
          ))}
        </div>
        <p className="lede" style={{ marginTop: "12px" }}>
          Copy these down — the temporary password won't be shown again.
        </p>
        <div className="form-actions" style={{ marginTop: "12px" }}>
          <button className="button primary-button" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default IdConfirmModal;
