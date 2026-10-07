import React, { useMemo, useState } from "react";

import { ASSIGNABLE_ROLES } from "../../auth/accessRules";
import { useAsync } from "../../hooks/useAsync";
import { friendlyError } from "../../lib/errors";
import { formatDate } from "../../lib/dates";
import { getAccount, provisionAccount, rejectAccount } from "../../lib/services/accounts";
import Badge from "../ui/Badge";
import Modal from "../ui/Modal";
import { useToast } from "../ui/Toast";

const LABEL = { student: "Student", parent: "Parent", teacher: "Teacher" };
const STATUS_TONE = { pending: "info", active: "success", suspended: "warning", rejected: "danger", incomplete: "warning" };
const str = (v) => (v == null ? "" : String(v));

/** Review a registration (or edit an existing account): choose the final role, provision the entity, activate. */
export default function ReviewDialog({ userId, lookups, onClose, onDone }) {
  const { toast } = useToast();
  const { data: acct, loading, error } = useAsync(() => getAccount(userId), [userId]);
  if (loading) return <Modal title="Review account" onClose={onClose}><p className="lede" role="status">Loading…</p></Modal>;
  if (error) return <Modal title="Review account" onClose={onClose}><p className="form-error" role="alert">{friendlyError(error, "Unable to load this account.")}</p><div className="modal-actions"><button className="btn btn-outline" onClick={onClose}>Close</button></div></Modal>;
  return <Form acct={acct} lookups={lookups} onClose={onClose} onDone={onDone} toast={toast} />;
}

function Form({ acct, lookups, onClose, onDone, toast }) {
  const isNew = ["pending", "rejected", "incomplete"].includes(acct.status);
  const isAdmin = acct.role === "admin" && ["active", "suspended"].includes(acct.status);
  const [role, setRole] = useState(isNew ? (acct.requested_role || (acct.status === "incomplete" ? acct.role : "student")) : acct.role);
  const s = acct.student || {}; const t = acct.teacher || {};
  const [stu, setStu] = useState({ roll_no: str(s.roll_no), class_id: str(s.class_id), dob: str(s.dob), gender: str(s.gender), address: str(s.address), admission_date: str(s.admission_date), parent_id: str(s.parent_id) });
  const [tea, setTea] = useState({ employee_id: str(t.employee_id), department: str(t.department), qualification: str(t.qualification), joining_date: str(t.joining_date) });
  const [children, setChildren] = useState(() => new Set((acct.children || []).map((c) => c.id)));
  const [assign, setAssign] = useState(() => new Set((acct.assignments || []).map((a) => `${a.class_id}|${a.subject_id}`)));
  const [classTeacher, setClassTeacher] = useState(() => new Set(acct.class_teacher_of || []));
  const [childQuery, setChildQuery] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const cls = lookups.classes.find((c) => c.id === stu.class_id);
  const subjectsByClass = useMemo(() => lookups.classes.map((c) => ({ c, subjects: lookups.subjects.filter((x) => x.class_id === c.id) })).filter((g) => g.subjects.length), [lookups]);
  const kids = useMemo(() => lookups.students.filter((k) => `${k.profiles?.full_name} ${k.roll_no}`.toLowerCase().includes(childQuery.toLowerCase())), [lookups.students, childQuery]);
  const toggle = (setter, key) => setter((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const payload = () => {
    if (role === "student") return { ...stu };
    if (role === "parent") return { child_ids: [...children] };
    return { ...tea, assignments: [...assign].map((k) => { const [class_id, subject_id] = k.split("|"); return { class_id, subject_id }; }), class_teacher_of: [...classTeacher] };
  };
  const run = async (fn, okMsg) => {
    setBusy(true); setErr("");
    try { await fn(); toast(okMsg); onDone(); }
    catch (e) { setErr(friendlyError(e, "Something went wrong. Nothing was changed — please check the details and try again.")); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={isNew ? "Review account request" : "Account details"} onClose={onClose} wide>
      <div className="review-grid">
        <section aria-label="Personal information"><h4>Personal information</h4>
          <dl className="kv"><div><span className="k">Full name</span><span>{acct.full_name || "—"}</span></div>
            <div><span className="k">Email</span><span>{acct.email || "—"}</span></div>
            <div><span className="k">Phone</span><span>{acct.phone || "—"}</span></div></dl></section>
        <section aria-label="Registration information"><h4>Registration</h4>
          <dl className="kv"><div><span className="k">Requested role</span><span>{acct.requested_role ? LABEL[acct.requested_role] : "—"}</span></div>
            <div><span className="k">Registered</span><span>{acct.created_at ? formatDate(acct.created_at) : "—"}</span></div>
            <div><span className="k">Status</span><span><Badge tone={STATUS_TONE[acct.status]}>{acct.status}</Badge></span></div>
            {acct.rejection_reason && <div><span className="k">Rejected because</span><span>{acct.rejection_reason}</span></div>}
            {acct.status_reason && <div><span className="k">Suspension note</span><span>{acct.status_reason}</span></div>}</dl></section>
      </div>

      {isAdmin ? <p className="notice-inline info">Administrator accounts can only be suspended or reactivated from the table.</p> : (<>
        <h4 style={{ margin: "16px 0 6px" }}>Role assignment</h4>
        <label className="student-form"><span className="sr-only">Assigned role</span>
          <select aria-label="Assigned role" value={role} onChange={(e) => setRole(e.target.value)} disabled={!isNew && acct.status !== "pending"}>
            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{LABEL[r]}{r === acct.requested_role ? " (requested)" : ""}</option>)}
          </select></label>
        {!isNew && <p className="feed-meta">The role can't be changed once an account has records under it.</p>}

        {role === "student" && (<fieldset className="prov"><legend>Student details</legend><div className="form-grid">
          <label>Student ID<input value={s.student_code || "Assigned automatically"} disabled /></label>
          <label>Roll number *<input value={stu.roll_no} onChange={(e) => setStu({ ...stu, roll_no: e.target.value })} /></label>
          <label>Class *<select value={stu.class_id} onChange={(e) => setStu({ ...stu, class_id: e.target.value })}><option value="">Select class</option>
            {lookups.classes.map((c) => <option key={c.id} value={c.id}>{c.name}-{c.section}</option>)}</select></label>
          <label>Section / academic year<input value={cls ? `${cls.section} · ${cls.academic_year}` : "—"} disabled /></label>
          <label>Parent / guardian<select value={stu.parent_id} onChange={(e) => setStu({ ...stu, parent_id: e.target.value })}><option value="">Not linked</option>
            {lookups.parents.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>)}</select></label>
          <label>Date of birth<input type="date" value={stu.dob} onChange={(e) => setStu({ ...stu, dob: e.target.value })} /></label>
          <label>Gender<select value={stu.gender} onChange={(e) => setStu({ ...stu, gender: e.target.value })}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></label>
          <label>Admission date<input type="date" value={stu.admission_date} onChange={(e) => setStu({ ...stu, admission_date: e.target.value })} /></label>
          <label style={{ gridColumn: "1 / -1" }}>Address<input value={stu.address} onChange={(e) => setStu({ ...stu, address: e.target.value })} /></label></div></fieldset>)}

        {role === "parent" && (<fieldset className="prov"><legend>Children *</legend>
          <p className="feed-meta">A parent only ever sees the children linked here.</p>
          <input aria-label="Search students" placeholder="Search students" value={childQuery} onChange={(e) => setChildQuery(e.target.value)} />
          <ul className="check-list">{kids.map((k) => { const other = k.parent_id && k.parent_id !== acct.id; return (
            <li key={k.id}><label><input type="checkbox" checked={children.has(k.id)} disabled={other} onChange={() => toggle(setChildren, k.id)} />
              {k.profiles?.full_name} <span className="feed-meta">· {k.roll_no} · {k.classes ? `${k.classes.name}-${k.classes.section}` : "no class"}{other ? " · linked to another parent" : ""}</span></label></li>); })}
            {!kids.length && <li className="feed-meta">No students match.</li>}</ul></fieldset>)}

        {role === "teacher" && (<fieldset className="prov"><legend>Teacher details</legend><div className="form-grid">
          <label>Teacher ID<input value={t.teacher_code || "Assigned automatically"} disabled /></label>
          <label>Employee ID *<input value={tea.employee_id} onChange={(e) => setTea({ ...tea, employee_id: e.target.value })} /></label>
          <label>Department *<input value={tea.department} onChange={(e) => setTea({ ...tea, department: e.target.value })} /></label>
          <label>Qualification<input value={tea.qualification} onChange={(e) => setTea({ ...tea, qualification: e.target.value })} /></label>
          <label>Joining date<input type="date" value={tea.joining_date} onChange={(e) => setTea({ ...tea, joining_date: e.target.value })} /></label></div>
          <h5 style={{ margin: "12px 0 4px" }}>Classes &amp; subjects taught</h5>
          <div className="assign-grid">{subjectsByClass.map(({ c, subjects }) => (
            <div key={c.id} className="assign-class"><b>Class {c.name}-{c.section}</b>
              {subjects.map((sb) => <label key={sb.id}><input type="checkbox" checked={assign.has(`${c.id}|${sb.id}`)} onChange={() => toggle(setAssign, `${c.id}|${sb.id}`)} /> {sb.name}</label>)}</div>))}</div>
          <h5 style={{ margin: "12px 0 4px" }}>Class teacher of</h5>
          <div className="assign-grid">{lookups.classes.map((c) => { const other = c.class_teacher_id && c.class_teacher_id !== acct.id; return (
            <label key={c.id}><input type="checkbox" checked={classTeacher.has(c.id)} disabled={other} onChange={() => toggle(setClassTeacher, c.id)} /> {c.name}-{c.section}{other ? " (has class teacher)" : ""}</label>); })}</div></fieldset>)}
      </>)}

      {err && <p className="form-error" role="alert" style={{ marginTop: 10 }}>{err}</p>}
      {rejecting && (<div className="notice-inline danger"><label className="student-form"><span>Reason (optional, shown to the applicant)</span>
        <textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <div className="form-actions" style={{ marginTop: 8 }}>
          <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => run(() => rejectAccount(acct.id, reason), "Registration rejected.")}>Confirm rejection</button>
          <button className="btn btn-outline btn-sm" onClick={() => setRejecting(false)}>Back</button></div></div>)}

      <div className="modal-actions" style={{ flexWrap: "wrap" }}>
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
        {!isAdmin && ["pending", "incomplete"].includes(acct.status) && !rejecting && <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setRejecting(true)}>Reject</button>}
        {!isAdmin && acct.status !== "active" && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => provisionAccount(acct.id, role, payload(), false), "Saved. The account is marked incomplete until the details are finished.")}>Save &amp; finish later</button>}
        {!isAdmin && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => provisionAccount(acct.id, role, payload(), true), acct.status === "active" ? "Account updated." : "Account approved and activated.")}>{busy ? "Saving…" : acct.status === "active" ? "Save changes" : "Approve & activate"}</button>}
      </div>
    </Modal>
  );
}
