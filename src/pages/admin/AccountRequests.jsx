import React, { useEffect, useState } from "react";

import ReviewDialog from "../../components/accounts/ReviewDialog";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import { SkeletonTable } from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { useAsync } from "../../hooks/useAsync";
import { formatDate } from "../../lib/dates";
import { friendlyError } from "../../lib/errors";
import { avatarClass, initials } from "../../lib/format";
import {
  getAccountCounts, listAccounts, loadProvisioningLookups, promoteToAdmin, reactivateAccount, suspendAccount,
} from "../../lib/services/accounts";

const FILTERS = [["", "All", "total"], ["pending", "Pending", "pending"], ["active", "Active", "active"], ["incomplete", "Incomplete", "incomplete"], ["rejected", "Rejected", "rejected"], ["suspended", "Suspended", "suspended"]];
const TONE = { pending: "info", active: "success", suspended: "warning", rejected: "danger", incomplete: "warning" };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "—");

export default function AccountRequests() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState("pending");
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [review, setReview] = useState(null);
  const [suspend, setSuspend] = useState(null);
  const [reason, setReason] = useState("");
  const [promote, setPromote] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(0); }, 300); return () => clearTimeout(t); }, [search]);

  const counts = useAsync(getAccountCounts, []);
  const list = useAsync(() => listAccounts({ status, role, search: q, page }), [status, role, q, page]);
  const lookups = useAsync(loadProvisioningLookups, []);
  const refresh = () => { counts.reload(); list.reload(); lookups.reload(); };
  const c = counts.data || {};
  const pages = Math.max(1, Math.ceil((list.data?.total || 0) / 25));

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast(okMsg); refresh(); } catch (e) { toast(friendlyError(e), "error"); } finally { setBusy(false); setSuspend(null); setPromote(null); setReason(""); }
  };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Accounts &amp; requests</h1><p>Review new registrations, assign roles, and manage every account.</p></div></div>

      <div className="stat-grid">
        <StatCard label="Total users" icon="users" tone="primary" value={String(c.total ?? "—")} />
        <StatCard label="Pending approvals" icon="clock" tone={c.pending ? "rose" : "success"} value={String(c.pending ?? "—")} hint={c.pending ? "Need your review" : "All handled"} />
        <StatCard label="Active students" icon="users" tone="info" value={String(c.students ?? "—")} />
        <StatCard label="Active teachers" icon="user" tone="violet" value={String(c.teachers ?? "—")} />
        <StatCard label="Active parents" icon="users" tone="success" value={String(c.parents ?? "—")} />
        <StatCard label="Suspended" icon="alert" tone={c.suspended ? "warning" : "muted"} value={String(c.suspended ?? "—")} />
      </div>

      <Card>
        <div className="tabs" role="tablist" aria-label="Filter by status">
          {FILTERS.map(([value, label, key]) => (
            <button key={label} role="tab" aria-selected={status === value} className="tab" onClick={() => { setStatus(value); setPage(0); }}>
              {label}{counts.data ? ` (${c[key] ?? 0})` : ""}
            </button>))}
        </div>
        <div className="toolbar">
          <label className="sr-only" htmlFor="acct-search">Search accounts</label>
          <input id="acct-search" className="search-wrap" placeholder="Search name, email, phone, student ID, employee ID" value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="sr-only" htmlFor="acct-role">Role</label>
          <select id="acct-role" value={role} onChange={(e) => { setRole(e.target.value); setPage(0); }}>
            <option value="">All roles</option><option value="student">Student</option><option value="parent">Parent</option><option value="teacher">Teacher</option><option value="admin">Admin</option></select>
        </div>

        {list.loading ? <SkeletonTable rows={6} /> : list.error ? <ErrorState message="Unable to load accounts." onRetry={list.reload} />
          : !list.data.rows.length ? <EmptyState icon="users" title={status === "pending" ? "No pending registrations" : "No accounts match"} hint={status === "pending" ? "New registrations will appear here and as a notification." : "Try another filter or search."} />
          : (<div className="table-wrap"><table className="data">
            <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Record</th><th>Registered</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{list.data.rows.map((r) => {
              const mine = r.id === user.id; const unprovisioned = r.status === "pending" || r.status === "rejected";
              return (
                <tr key={r.id} className={r.status === "pending" ? "row-pending" : ""}>
                  <td><div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className={`avatar ${avatarClass(r.full_name)}`} aria-hidden="true">{initials(r.full_name)}</span>
                    <span><b>{r.full_name || "(no name)"}</b>{mine ? " (you)" : ""}<div className="feed-meta">{r.email}{r.phone ? ` · ${r.phone}` : ""}</div></span></div></td>
                  <td>{unprovisioned ? <span className="feed-meta">Requested: <b>{cap(r.requested_role)}</b></span> : <Badge tone={r.role === "admin" ? "rose" : "primary"}>{cap(r.role)}</Badge>}</td>
                  <td><Badge tone={TONE[r.status]}>{cap(r.status)}</Badge>{r.status === "rejected" && r.rejection_reason && <div className="feed-meta">{r.rejection_reason}</div>}</td>
                  <td>{r.entity_code || "—"}{r.entity_detail && <div className="feed-meta">{r.entity_detail}</div>}</td>
                  <td>{r.created_at ? formatDate(r.created_at) : "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {!mine && (<>
                      {(unprovisioned || r.status === "incomplete") && <button className="btn btn-primary btn-sm" onClick={() => setReview(r.id)}>Review</button>}{" "}
                      {r.status === "active" && r.role !== "admin" && <button className="btn btn-outline btn-sm" onClick={() => setReview(r.id)}>Edit</button>}{" "}
                      {r.status === "active" && <button className="btn btn-outline btn-sm" onClick={() => setSuspend(r)}>Suspend</button>}{" "}
                      {r.status === "active" && r.role !== "admin" && <button className="btn btn-outline btn-sm" onClick={() => setPromote(r)}>Make admin</button>}
                      {r.status === "suspended" && <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => act(() => reactivateAccount(r.id), "Account reactivated.")}>Reactivate</button>}
                    </>)}
                  </td></tr>); })}</tbody></table></div>)}
        <div className="pager"><span>{list.data?.total ?? 0} account{list.data?.total === 1 ? "" : "s"}</span>
          <span><button className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button> Page {page + 1} of {pages} <button className="btn btn-outline btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></span></div>
      </Card>

      {review && (lookups.loading ? null : lookups.error
        ? <Modal title="Review account" onClose={() => setReview(null)}><p className="form-error" role="alert">Unable to load classes and students.</p></Modal>
        : <ReviewDialog userId={review} lookups={lookups.data} onClose={() => setReview(null)} onDone={() => { setReview(null); refresh(); }} />)}

      {suspend && (
        <Modal title={`Suspend ${suspend.full_name || suspend.email}?`} onClose={() => setSuspend(null)}>
          <p className="lede">They will be logged out of all data access immediately. Their records are kept and you can reactivate the account later.</p>
          <label className="student-form"><span>Note (optional, shown to the user)</span><textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="modal-actions"><button className="btn btn-outline" onClick={() => setSuspend(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={busy} onClick={() => act(() => suspendAccount(suspend.id, reason), "Account suspended.")}>Suspend account</button></div>
        </Modal>)}
      <ConfirmDialog open={!!promote} title="Make this user an administrator?" confirmLabel="Make admin"
        message={promote ? `${promote.full_name || promote.email} will get full administrative access. This is recorded in the audit log.` : ""}
        onCancel={() => setPromote(null)} onConfirm={() => act(() => promoteToAdmin(promote.id), "User is now an administrator.")} />
    </div>
  );
}
