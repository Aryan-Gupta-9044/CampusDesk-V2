import React, { useEffect, useRef } from "react";

// Reusable confirmation for destructive actions.
export default function ConfirmDialog({ open, title, message, confirmLabel = "Delete", onConfirm, onCancel }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    ref.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="cd-title">
        <h3 id="cd-title">{title}</h3>
        <p className="lede" style={{ marginBottom: 0 }}>{message}</p>
        <div className="modal-actions">
          <button type="button" ref={ref} className="btn btn-outline" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
