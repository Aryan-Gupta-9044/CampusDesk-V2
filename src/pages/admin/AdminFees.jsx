import React, { useEffect, useMemo, useState } from "react";

import { useAsync } from "../../hooks/useAsync";
import { listClasses } from "../../lib/queries/classes";
import { addFeeStructure, deleteFeeStructure, listFeeStructures, listStudentsForClass } from "../../lib/queries/fees";
import {
  getFeeLines, listPendingQueue, recordOfflinePayment, rejectFeePayment, searchPayments, verifyFeePayment,
} from "../../lib/services/fees";
import { exportCsv } from "../../lib/csv";
import { friendlyError } from "../../lib/errors";
import { formatDate } from "../../lib/dates";
import { inr } from "../../lib/format";
import { FEE_STATUS_LABEL, FEE_STATUS_TONE } from "../../lib/metrics";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import ReceiptDialog from "../../components/fees/ReceiptDialog";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";

const TABS = [["queue", "Verification queue"], ["ledger", "Payments"], ["record", "Record payment"], ["structure", "Fee structure"]];
const who = (p) => p.students?.profiles?.full_name || "Unknown student";

function Queue() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useAsync(listPendingQueue, []);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast(okMsg); } catch (e) { toast(friendlyError(e), "error"); } finally { setBusy(false); setRejecting(null); setConfirm(null); setReason(""); reload(); }
  };
  return (
    <Card title="Payments awaiting verification" subtitle="Approving recalculates the balance inside the database; a payment that no longer fits is refused.">
      {loading ? <SkeletonTable /> : error ? <ErrorState message="Unable to load the queue." onRetry={reload} />
        : !data.length ? <EmptyState icon="check" title="Nothing to verify" hint="New student/parent payments appear here." />
        : <div className="table-wrap"><table className="data">
          <thead><tr><th>Student</th><th>Fee</th><th>Amount</th><th>Mode</th><th>Reference</th><th>Submitted</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.id}>
              <td>{who(p)}<div className="feed-meta">{p.students?.student_code || p.students?.roll_no}</div></td>
              <td>{p.fee_structure?.fee_type}<div className="feed-meta">of {inr(p.fee_structure?.amount)}</div></td>
              <td><b>{inr(p.amount_paid)}</b></td><td>{p.mode || "—"}</td><td>{p.reference_note || "—"}</td>
              <td>{formatDate(p.created_at)}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setConfirm(p)}>Approve</button>{" "}
                <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setRejecting(p)}>Reject</button>
              </td>
            </tr>))}</tbody></table></div>}
      <ConfirmDialog open={!!confirm} title="Approve this payment?" confirmLabel="Approve & issue receipt"
        message={confirm ? `${inr(confirm.amount_paid)} from ${who(confirm)} for ${confirm.fee_structure?.fee_type} will be added to the confirmed balance and a receipt number issued.` : ""}
        onCancel={() => setConfirm(null)} onConfirm={() => act(() => verifyFeePayment(confirm.id), "Payment verified. Receipt issued.")} />
      {rejecting && (
        <Modal title="Reject payment" onClose={() => setRejecting(null)}>
          <p className="lede">{inr(rejecting.amount_paid)} from {who(rejecting)}. The student and parent are notified and can submit again.</p>
          <label className="student-form"><span>Reason (shown to the student)</span>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setRejecting(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={busy} onClick={() => act(() => rejectFeePayment(rejecting.id, reason), "Payment rejected.")}>Reject payment</button>
          </div>
        </Modal>)}
    </Card>
  );
}

function Ledger() {
  const [filters, setFilters] = useState({ status: "", from: "", to: "" });
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [receipt, setReceipt] = useState(null);
  const { data, loading, error, reload } = useAsync(() => searchPayments({ ...filters, page }), [filters, page]);
  const rows = useMemo(() => (data?.rows || []).filter((p) => !q || `${who(p)} ${p.receipt_no || ""} ${p.students?.roll_no || ""}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const pages = Math.max(1, Math.ceil((data?.count || 0) / 25));
  return (
    <Card title="All payments" subtitle="Official receipts exist only for verified payments.">
      <div className="toolbar">
        <input aria-label="Search this page" placeholder="Search student / receipt" value={q} onChange={(e) => setQ(e.target.value)} className="search-wrap" />
        <select aria-label="Status" value={filters.status} onChange={(e) => { setPage(0); setFilters({ ...filters, status: e.target.value }); }}>
          <option value="">All statuses</option>{Object.entries(FEE_STATUS_LABEL).filter(([k]) => k !== "due").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input aria-label="From date" type="date" value={filters.from} onChange={(e) => { setPage(0); setFilters({ ...filters, from: e.target.value }); }} />
        <input aria-label="To date" type="date" value={filters.to} onChange={(e) => { setPage(0); setFilters({ ...filters, to: e.target.value }); }} />
        <button className="btn btn-outline btn-sm" disabled={!rows.length} onClick={() => exportCsv("payments.csv",
          ["Student", "Student ID", "Fee", "Amount", "Date", "Mode", "Status", "Receipt", "Reference"],
          rows.map((p) => [who(p), p.students?.student_code, p.fee_structure?.fee_type, p.amount_paid, p.payment_date, p.mode, p.status, p.receipt_no, p.reference_note]))}>Export CSV</button>
      </div>
      {loading ? <SkeletonTable /> : error ? <ErrorState message="Unable to load payments." onRetry={reload} />
        : !rows.length ? <EmptyState icon="wallet" title="No payments match" />
        : <div className="table-wrap"><table className="data">
          <thead><tr><th>Date</th><th>Student</th><th>Fee</th><th>Amount</th><th>Status</th><th>Receipt</th></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}><td>{formatDate(p.payment_date)}</td><td>{who(p)}</td><td>{p.fee_structure?.fee_type}</td><td>{inr(p.amount_paid)}</td>
              <td><Badge tone={FEE_STATUS_TONE[p.status]}>{FEE_STATUS_LABEL[p.status]}</Badge></td>
              <td>{p.receipt_no && (p.status === "paid" || p.status === "partial") ? <button className="text-link" onClick={() => setReceipt(p.id)}>{p.receipt_no}</button> : "—"}</td></tr>))}</tbody></table></div>}
      <div className="pager"><span>{data?.count || 0} payments</span>
        <span><button className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>{" "}
          Page {page + 1} of {pages}{" "}
          <button className="btn btn-outline btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></span></div>
      {receipt && <ReceiptDialog paymentId={receipt} onClose={() => setReceipt(null)} />}
    </Card>
  );
}

function RecordPayment() {
  const { toast } = useToast();
  const classes = useAsync(listClasses, []);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [form, setForm] = useState({ feeId: "", amount: "", mode: "cash", reference: "" });
  const students = useAsync(() => listStudentsForClass(classId), [classId], { enabled: !!classId });
  const lines = useAsync(() => getFeeLines(studentId), [studentId], { enabled: !!studentId });
  const line = (lines.data || []).find((l) => l.fee_structure_id === form.feeId);
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await recordOfflinePayment({ studentId, feeId: form.feeId, amount: form.amount, mode: form.mode, reference: form.reference });
      toast(`Payment recorded. Receipt ${r.receipt_no}.`); setForm({ ...form, amount: "", reference: "" }); lines.reload();
    } catch (err) { toast(friendlyError(err), "error"); lines.reload(); }
  };
  return (
    <Card title="Record an offline payment" subtitle="Cash / cheque received at the office. It is confirmed immediately and a receipt is issued.">
      <form className="student-form" onSubmit={submit}>
        <div className="form-grid">
          <label>Class<select value={classId} onChange={(e) => { setClassId(e.target.value); setStudentId(""); }}>
            <option value="">Select class</option>{(classes.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select></label>
          <label>Student<select value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={!classId}>
            <option value="">Select student</option>{(students.data || []).map((s) => <option key={s.id} value={s.id}>{s.roll_no} · {s.profiles?.full_name}</option>)}</select></label>
          <label>Fee<select value={form.feeId} onChange={(e) => setForm({ ...form, feeId: e.target.value })} disabled={!studentId}>
            <option value="">Select fee</option>{(lines.data || []).map((l) => <option key={l.fee_structure_id} value={l.fee_structure_id}>{l.fee_type} — remaining {inr(l.remaining)}</option>)}</select></label>
          <label>Amount (₹)<input type="number" min="1" step="0.01" max={line?.remaining || undefined} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
          <label>Mode<select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="bank transfer">Bank transfer</option><option value="UPI">UPI</option></select></label>
          <label>Reference<input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>
        </div>
        {line && line.status === "pending_verification" && <div className="notice-inline warning" role="status">A payment of {inr(line.pending_amount)} is awaiting verification for this fee. Verify or reject it in the queue first.</div>}
        <div className="form-actions"><button className="btn btn-primary" disabled={!form.feeId || !form.amount || (line && !(Number(line.remaining) > 0))}>Record payment</button></div>
      </form>
    </Card>
  );
}

function Structure() {
  const { toast } = useToast();
  const classes = useAsync(listClasses, []);
  const { data, loading, error, reload } = useAsync(listFeeStructures, []);
  const [form, setForm] = useState({ classId: "", academicYear: "", feeType: "", amount: "", dueDate: "" });
  const [del, setDel] = useState(null);
  useEffect(() => { if (!form.classId && classes.data?.length) setForm((f) => ({ ...f, classId: classes.data[0].id })); }, [classes.data, form.classId]);
  const add = async (e) => {
    e.preventDefault();
    try { await addFeeStructure(form); toast("Fee item added."); setForm({ ...form, feeType: "", amount: "", dueDate: "" }); reload(); }
    catch (err) { toast(friendlyError(err), "error"); }
  };
  const remove = async () => {
    try { await deleteFeeStructure(del.id); toast("Fee item removed."); reload(); } catch (err) { toast(friendlyError(err, "This fee item has payments and cannot be removed."), "error"); }
    setDel(null);
  };
  return (
    <div className="stack">
      <Card title="Fee structure">
        {loading ? <SkeletonTable /> : error ? <ErrorState message="Unable to load fees." onRetry={reload} />
          : !data.length ? <EmptyState icon="wallet" title="No fee items yet" />
          : <div className="table-wrap"><table className="data"><thead><tr><th>Class</th><th>Fee</th><th>Amount</th><th>Due</th><th /></tr></thead>
            <tbody>{data.map((f) => (<tr key={f.id}><td>{f.classes?.name}-{f.classes?.section}</td><td>{f.fee_type}</td><td>{inr(f.amount)}</td><td>{f.due_date ? formatDate(f.due_date) : "—"}</td>
              <td><button className="btn btn-danger btn-sm" onClick={() => setDel(f)}>Remove</button></td></tr>))}</tbody></table></div>}
      </Card>
      <Card title="Add a fee item">
        <form className="student-form" onSubmit={add}><div className="form-grid">
          <label>Class<select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} required>{(classes.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select></label>
          <label>Academic year<input value={form.academicYear} placeholder="2026-27" onChange={(e) => setForm({ ...form, academicYear: e.target.value })} /></label>
          <label>Fee type<input value={form.feeType} onChange={(e) => setForm({ ...form, feeType: e.target.value })} required /></label>
          <label>Amount (₹)<input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
          <label>Due date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
        </div><div className="form-actions"><button className="btn btn-primary">Add fee item</button></div></form>
      </Card>
      <ConfirmDialog open={!!del} title="Remove this fee item?" confirmLabel="Remove" message={del ? `${del.fee_type} for class ${del.classes?.name}-${del.classes?.section}. Payments linked to it will also be removed.` : ""} onCancel={() => setDel(null)} onConfirm={remove} />
    </div>
  );
}

export default function AdminFees() {
  const [tab, setTab] = useState("queue");
  return (
    <div className="page">
      <div className="page-head"><div><h1>Fees &amp; payments</h1><p>Verify payments, issue receipts, manage the fee structure.</p></div></div>
      <div className="tabs" role="tablist">{TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{label}</button>)}</div>
      {tab === "queue" && <Queue />}{tab === "ledger" && <Ledger />}{tab === "record" && <RecordPayment />}{tab === "structure" && <Structure />}
    </div>
  );
}
