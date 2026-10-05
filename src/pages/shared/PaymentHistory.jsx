import React, { useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { useChild } from "../../context/ChildContext";
import { useAsync } from "../../hooks/useAsync";
import { listPaymentHistory } from "../../lib/services/fees";
import { formatDate } from "../../lib/dates";
import { inr } from "../../lib/format";
import { FEE_STATUS_LABEL, FEE_STATUS_TONE } from "../../lib/metrics";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import ReceiptDialog from "../../components/fees/ReceiptDialog";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/States";

export default function PaymentHistory() {
  const { user, role } = useAuth();
  const { child } = useChild();
  const studentId = role === "parent" ? child?.id : user.id;
  const { data, loading, error, reload } = useAsync(() => listPaymentHistory(studentId), [studentId], { enabled: !!studentId });
  const [receipt, setReceipt] = useState(null);

  return (
    <div className="page">
      <div className="page-head"><div><h1>Payment history</h1><p>Every payment submitted or recorded. Receipts are issued only for verified payments.</p></div></div>
      <Card>
        {loading ? <SkeletonTable /> : error ? <ErrorState message="Unable to load payment history." onRetry={reload} />
          : !studentId ? <EmptyState icon="user" title="No student linked" />
          : !data.length ? <EmptyState icon="wallet" title="No payments yet" hint="Payments appear here once submitted." />
          : <div className="table-wrap"><table className="data">
            <thead><tr><th>Submitted</th><th>Fee</th><th>Amount</th><th>Mode</th><th>Reference</th><th>Status</th><th>Receipt</th></tr></thead>
            <tbody>{data.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.payment_date || p.created_at)}</td><td>{p.fee_structure?.fee_type || "—"}</td>
                <td>{inr(p.amount_paid)}</td><td>{p.mode || "—"}</td><td>{p.reference_note || "—"}</td>
                <td><Badge tone={FEE_STATUS_TONE[p.status]}>{FEE_STATUS_LABEL[p.status]}</Badge>
                  {p.status === "rejected" && p.rejection_reason && <div className="feed-meta">{p.rejection_reason}</div>}
                  {p.status === "pending_verification" && <div className="feed-meta">Not counted until verified</div>}</td>
                <td>{(p.status === "paid" || p.status === "partial") && p.receipt_no
                  ? <button type="button" className="text-link" onClick={() => setReceipt(p.id)}>{p.receipt_no}</button> : "—"}</td>
              </tr>))}</tbody></table></div>}
      </Card>
      {receipt && <ReceiptDialog paymentId={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
