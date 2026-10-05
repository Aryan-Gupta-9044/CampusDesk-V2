import React from "react";
import { useAsync } from "../../hooks/useAsync";
import { getReceipt } from "../../lib/services/fees";
import { formatDate, formatDateTime } from "../../lib/dates";
import { inr } from "../../lib/format";
import { friendlyError } from "../../lib/errors";
import Modal from "../ui/Modal";

/** Official receipt - only ever rendered for verified (paid/partial) payments. */
export default function ReceiptDialog({ paymentId, onClose }) {
  const { data: r, loading, error } = useAsync(() => getReceipt(paymentId), [paymentId]);
  return (
    <Modal title="Payment receipt" onClose={onClose} wide>
      {loading ? <p className="lede">Loading…</p> : error ? <p className="form-error" role="alert">{friendlyError(error, "Unable to load the receipt.")}</p> : (
        <div className="receipt report-sheet" style={{ padding: 0, border: 0 }}>
          <div className="report-head">
            <div><h1 style={{ fontSize: 18 }}>CampusDesk</h1><div className="feed-meta">Official fee receipt</div></div>
            <div style={{ textAlign: "right" }}><b>{r.receipt_no}</b><div className="feed-meta">{formatDate(r.payment_date)}</div></div>
          </div>
          <dl className="kv">
            <div><span className="k">Student</span><span>{r.student_name}</span></div>
            <div><span className="k">Roll no.</span><span>{r.roll_no || "—"}</span></div>
            <div><span className="k">Class</span><span>{r.class || "—"} ({r.academic_year || "—"})</span></div>
            <div><span className="k">Fee type</span><span>{r.fee_type}</span></div>
            <div><span className="k">Amount paid</span><span><b>{inr(r.amount)}</b></span></div>
            <div><span className="k">Payment mode</span><span>{r.mode || "—"}</span></div>
            <div><span className="k">Reference</span><span>{r.reference || "—"}</span></div>
            <div><span className="k">Fee total</span><span>{inr(r.fee_amount)}</span></div>
            <div><span className="k">Verified by</span><span>{r.verified_by || "—"}</span></div>
            <div><span className="k">Verified on</span><span>{r.verified_at ? formatDateTime(r.verified_at) : "—"}</span></div>
          </dl>
          <p className="feed-meta" style={{ marginTop: 16 }}>This is a computer-generated receipt for a verified payment.</p>
        </div>
      )}
      <div className="modal-actions no-print">
        <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
        <button type="button" className="btn btn-primary" disabled={!r} onClick={() => window.print()}>Print receipt</button>
      </div>
    </Modal>
  );
}
