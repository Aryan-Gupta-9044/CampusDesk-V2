import React from "react";
import { Link } from "react-router-dom";

import DashboardHeader from "../../components/dashboard/DashboardHeader";
import { DashboardFrame, DashboardSkeleton } from "../../components/dashboard/Section";
import { ActivityFeed, UpcomingEvents } from "../../components/dashboard/Widgets";
import { ClassBarChart, DistributionChart, FeeChart } from "../../components/charts/Charts";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/States";
import StatCard from "../../components/ui/StatCard";
import { useAsync } from "../../hooks/useAsync";
import { useAuth } from "../../context/AuthContext";
import { describeActivity, getAdminDashboardData } from "../../lib/services/adminData";
import { formatDate, timeAgo } from "../../lib/dates";
import { attendanceStatus } from "../../lib/metrics";
import { inr, pctText } from "../../lib/format";

export default function AdminDashboard() {
  const { profile } = useAuth();
  const { data, loading, error, reload } = useAsync(getAdminDashboardData, []);

  return (
    <DashboardFrame loading={loading} error={error} onRetry={reload} skeleton={<DashboardSkeleton />}>
      {data && (() => {
        const { kpis, perClass, pendingLeave, pendingPayments, audit, events, health } = data;
        const att = attendanceStatus(kpis.attendancePct);
        const approvals = pendingLeave.length + pendingPayments.length;
        return (
          <>
            <DashboardHeader name={profile?.full_name?.split(" ")[0]} subtitle="Institution overview"
              actions={[{ label: "Post Notice", to: "/notices" }, { label: "Add Event", to: "/events" }, { label: "Add Student", to: "/students/new" }]} />
            <div className="stat-grid">
              <StatCard label="Total students" icon="users" tone="primary" value={String(kpis.students)} />
              <StatCard label="Total teachers" icon="user" tone="info" value={String(kpis.teachers)} />
              <StatCard label="Total classes" icon="book" tone="muted" value={String(kpis.classes)} />
              <StatCard label="Overall attendance" icon="check" tone={att.tone} value={pctText(kpis.attendancePct)} status={att} hint="Last 30 days" />
              <StatCard label="Fees collected" icon="wallet" tone="success" value={inr(kpis.feesCollected)} />
              <StatCard label="Pending fees" icon="wallet" tone={kpis.pendingFees ? "warning" : "success"} value={inr(kpis.pendingFees)} hint="Outstanding (confirmed basis)" />
              <StatCard label="Pending payments" icon="clock" tone={kpis.pendingPayments ? "info" : "success"} value={String(kpis.pendingPayments)} hint="Awaiting verification" />
              <StatCard label="Pending leave" icon="file" tone={kpis.pendingLeave ? "warning" : "success"} value={String(kpis.pendingLeave)} hint="Awaiting decision" />
              <StatCard label="Upcoming exams" icon="book" tone="info" value={String(kpis.upcomingExams)} />
            </div>

            <div className="grid-2">
              <Card title="Attendance by class" subtitle="Which class has attendance issues? (last 30 days)">
                <ClassBarChart data={perClass} series={[{ key: "attendancePct", name: "Attendance" }]} />
              </Card>
              <Card title="Academic performance by class" subtitle="Average of published results">
                <ClassBarChart data={perClass} series={[{ key: "avgScore", name: "Average score" }]} />
              </Card>
            </div>
            <div className="grid-2">
              <Card title="Fee collection" subtitle="Collected vs outstanding per class" actionTo="/fees" actionLabel="Fees">
                <FeeChart data={perClass} />
              </Card>
              <Card title="Students & teachers by class">
                <DistributionChart data={perClass} />
              </Card>
            </div>

            <div className="grid-2">
              <Card title="Pending approvals" subtitle={`${approvals} item${approvals === 1 ? "" : "s"} need attention`}>
                {approvals === 0 ? <EmptyState icon="check" title="Nothing pending" hint="All requests are handled." /> : (
                  <ul className="feed">
                    {pendingLeave.map((l) => (
                      <li key={l.id}><div style={{ flex: 1 }}>
                        <div className="feed-title">Leave: {l.profiles?.full_name || "Unknown"} <Badge tone="warning">Pending</Badge></div>
                        <div className="feed-meta">{formatDate(l.from_date)} – {formatDate(l.to_date)} · requested {timeAgo(l.created_at)}</div>
                      </div><Link className="card-link" to="/leave">Review</Link></li>
                    ))}
                    {pendingPayments.map((p) => (
                      <li key={p.id}><div style={{ flex: 1 }}>
                        <div className="feed-title">Payment: {p.students?.profiles?.full_name || "Unknown"} <Badge tone="info">Awaiting verification</Badge></div>
                        <div className="feed-meta">{inr(p.amount_paid)}</div>
                      </div><Link className="card-link" to="/fees">Verify</Link></li>
                    ))}
                  </ul>
                )}
              </Card>
              <ActivityFeed rows={audit} describe={describeActivity} />
            </div>
            <div className="grid-2">
              <Card title="System health" subtitle="Data quality and open work">
                <ul className="feed">{health.map((h) => (
                  <li key={h.key}><div style={{ flex: 1 }}>
                    <div className="feed-title" style={{ fontWeight: 500 }}>{h.label}</div>
                    {h.detail && h.count > 0 && <div className="feed-meta">{h.detail}</div>}
                  </div>
                  <Badge tone={h.count ? "warning" : "success"}>{h.count ? h.count : "OK"}</Badge>
                  {h.count > 0 && <Link className="card-link" to={h.to}>Fix</Link>}</li>))}</ul>
              </Card>
              <UpcomingEvents events={events} />
            </div>
          </>
        );
      })()}
    </DashboardFrame>
  );
}
