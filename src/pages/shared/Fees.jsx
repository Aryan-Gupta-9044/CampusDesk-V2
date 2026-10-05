import React, { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useChild } from "../../context/ChildContext";
import { useAsync } from "../../hooks/useAsync";
import { getFeeLines, submitFeePayment } from "../../lib/services/fees";
import { FEE_STATUS_LABEL, FEE_STATUS_TONE, canPayLine, summarizeFeeLines } from "../../lib/metrics";
import { friendlyError } from "../../lib/errors";
import { formatDate } from "../../lib/dates";
import { inr } from "../../lib/format";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import StatCard from "../../components/ui/StatCard";
import Modal from "../../components/ui/Modal";
import { SkeletonCard, SkeletonStats } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";

const MODES = ["UPI", "Bank transfer", "Cash at office", "Cheque", "Other"];

/** One fee row: amounts, status, and exactly one of Pay / Pending notice / Paid. */
export function FeeLineCard({ line, onPay }) {
  const tone = FEE_STATUS_TONE[line.status];
  const canPay = canPayLine(line);
  return (
    <div className="card fee-line" data-testid={`fee-${line.fee_type}`}>
      <div className="card-head" style={{ marginBottom: 8 }}>
        <div>
          <h3 className="card-title">{line.fee_type}</h3>
          <p className="card-sub">{line.due_date ? `Due ${formatDate(line.due_date)}` : "No due date"}</p>
        </div>
        <Badge tone={tone}>{FEE_STATUS_LABEL[line.status]}</Badge>
      </div>
      <dl className="fee-grid">
        <div><dt>Total fee</dt><dd>{inr(line.amount)}</dd></div>
        <div><dt>Confirmed paid</dt><dd>{inr(line.confirmed_paid)}</dd></div>
        <div><dt>Pending verification</dt><dd>{inr(line.pending_amount)}</dd></div>
        <div><dt>Remaining</dt><dd><strong>{inr(line.remaining)}</strong></dd></div>
      </dl>

      {line.status === "pending_verification" && (
        <div className="notice-inline info" role="status">
          <strong>Payment awaiting verification</strong>
          <p>
            {inr(line.pending_amount)} submitted{line.pending_date ? ` on ${formatDate(line.pending_date)}` : ""}
            {line.pending_mode ? ` via ${line.pending_mode}` : ""}
            {line.pending_reference ? ` (ref: ${line.pending_reference})` : ""}.
            The school office will confirm it shortly — you can't submit another payment for this fee until then.
          </p>
        </div>
      )}
      {line.last_rejection_reason !== null && line.status !== "pending_verification" && line.last_rejected_at && line.remaining > 0 && line.status === "rejected" && (
        <div className="notice-inline danger" role="status">
          <strong>Your last payment was rejected</strong>
          <p>{line.last_rejection_reason || "It could not be verified."} You can submit it again.</p>
        </div>
      )}

      <div className="form-actions" style={{ marginTop: 12 }}>
        {canPay && <button type="button" className="btn btn-primary" onClick={() => onPay(line)}>Pay {inr(line.remaining)}</button>}
        {!canPay && line.status === "pending_verification" && (
          <button type="button" className="btn btn-primary" disabled aria-disabled="true" title="A payment is awaiting verification">Awaiting verification</button>
        )}
        {line.status === "paid" && <span className="badge badge-success">✓ Fully paid</span>}
      </div>
    </div>
  );
}

function PayDialog({ line, studentId, onClose, onDone }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ amount: String(line.remaining), mode: MODES[0], reference: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amount = Number(form.amount);
  const invalid = !(amount > 0) || amount > Number(line.remaining);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await submitFeePayment({ studentId, feeId: line.fee_structure_id, amount, mode: form.mode, reference: form.reference });
      toast("Payment submitted for verification.");
      onDone();
    } catch (err) {
      setError(friendlyError(err));
      onDone(true); // refresh: another request may have been made elsewhere
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`Pay — ${line.fee_type}`} onClose={onClose}>
      <form onSubmit={submit} className="student-form">
        <p className="lede" style={{ margin: 0 }}>
          Make the payment with the school (UPI, bank transfer, cash or cheque), then record it here. It counts toward your balance after the office verifies it.
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <label>Amount (₹) — remaining {inr(line.remaining)}
          <input type="number" min="1" max={line.remaining} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </label>
        <label>Payment mode
          <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        <label>Reference / note (transaction ID, cheque no.)
          <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} maxLength={120} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || invalid}>{busy ? "Submitting…" : "Submit payment"}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Fees() {
  const { user, role } = useAuth();
  const { child } = useChild();
  const studentId = role === "parent" ? child?.id : user.id;
  const { data, loading, error, reload } = useAsync(() => getFeeLines(studentId), [studentId], { enabled: !!studentId });
  const [paying, setPaying] = useState(null);

  if (role === "parent" && !child) return <Card><EmptyState icon="user" title="No child linked" hint="Ask the school office to link your child." /></Card>;
  const sum = data ? summarizeFeeLines(data) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Fees</h1>
          <p>{role === "parent" ? `Fees for ${child?.profiles?.full_name}` : "Your fee status for this academic year"}</p>
        </div>
        <Link className="btn btn-outline btn-sm" to="/payment-history">Payment history &amp; receipts</Link>
      </div>
      {loading ? <><SkeletonStats /><SkeletonCard height={160} /></>
        : error ? <Card><ErrorState message="Unable to load fees." onRetry={reload} /></Card>
        : !sum.items.length ? <Card><EmptyState icon="wallet" title="No fees assigned" hint="No fee items exist for this class yet." /></Card>
        : (
          <>
            <div className="stat-grid">
              <StatCard label="Total fee" icon="wallet" tone="primary" value={inr(sum.total)} />
              <StatCard label="Confirmed paid" icon="check" tone="success" value={inr(sum.paid)} />
              <StatCard label="Pending verification" icon="clock" tone={sum.pending ? "info" : "muted"} value={inr(sum.pending)} hint={sum.pending ? "Not yet counted as paid" : ""} />
              <StatCard label="Remaining" icon="alert" tone={sum.due ? "warning" : "success"} value={inr(sum.due)}
                status={{ label: FEE_STATUS_LABEL[sum.status], tone: FEE_STATUS_TONE[sum.status] }} />
            </div>
            <div className="stack">{sum.items.map((l) => <FeeLineCard key={l.fee_structure_id} line={l} onPay={setPaying} />)}</div>
          </>
        )}
      {paying && (
        <PayDialog line={paying} studentId={studentId} onClose={() => setPaying(null)}
          onDone={(keepOpen) => { if (!keepOpen) setPaying(null); reload(); }} />
      )}
    </div>
  );
}
