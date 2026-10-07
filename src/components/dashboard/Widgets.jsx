import React from "react";

import { daysUntil, formatDate, formatTime, relativeDays, timeAgo } from "../../lib/dates";
import { FEE_STATUS_LABEL, FEE_STATUS_TONE, attendanceStatus, scoreStatus } from "../../lib/metrics";
import { inr, pctText, safe } from "../../lib/format";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import { EmptyState } from "../ui/States";

export function RecentNotices({ notices }) {
  return (
    <Card title="Recent notices" actionTo="/notices" actionLabel="View all notices">
      {!notices?.length ? <EmptyState icon="megaphone" title="No notices available" hint="New announcements will appear here." /> : (
        <ul className="feed">
          {notices.map((n) => (
            <li key={n.id}>
              <span className="notif-ico"><span aria-hidden="true">📢</span></span>
              <div>
                <div className="feed-title">{n.title}{n.pinned && <> <Badge tone="primary">Pinned</Badge></>}</div>
                <div className="feed-meta">{timeAgo(n.created_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const EVENT_TONE = { exam: "rose", meeting: "violet", activity: "success", deadline: "warning", holiday: "info", other: "muted" };

export function UpcomingEvents({ events }) {
  return (
    <Card title="Upcoming events" actionTo="/events" actionLabel="All events">
      {!events?.length ? <EmptyState icon="calendar" title="No upcoming events" /> : (
        <ul className="feed">
          {events.map((e) => {
            const d = new Date(`${e.event_date}T00:00:00+05:30`);
            return (
              <li key={e.id}>
                <div className="date-chip" aria-hidden="true">
                  <b>{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit" }).format(d)}</b>
                  <span>{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", month: "short" }).format(d)}</span>
                </div>
                <div>
                  <div className="feed-title">{e.title} <Badge tone={EVENT_TONE[e.event_type] || "muted"}>{e.event_type}</Badge></div>
                  <div className="feed-meta">
                    {formatDate(e.event_date)}{e.start_time ? ` · ${formatTime(e.start_time)}` : ""}{e.location ? ` · ${e.location}` : ""} · {relativeDays(daysUntil(e.event_date))}
                  </div>
                  {e.description && <div className="feed-meta">{e.description}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function UpcomingExams({ exams }) {
  return (
    <Card title="Upcoming exams" actionTo="/results" actionLabel="Results">
      {!exams?.length ? <EmptyState icon="book" title="No upcoming exams" /> : (
        <ul className="feed">
          {exams.map((x) => (
            <li key={x.id}>
              <div className="date-chip" aria-hidden="true"><b>{x.inDays}</b><span>days</span></div>
              <div>
                <div className="feed-title">{x.name}</div>
                <div className="feed-meta">{formatDate(x.start_date)}{x.end_date && x.end_date !== x.start_date ? ` – ${formatDate(x.end_date)}` : ""}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** ACADEMIC HEALTH - compact status rows (text + colour, never colour alone). */
export function AcademicHealth({ attendance, performance, nextExam, fees }) {
  const att = attendanceStatus(attendance.percent);
  const sc = scoreStatus(performance.average);
  const feeTone = FEE_STATUS_TONE[fees.status];
  return (
    <Card title="Academic health">
      <div>
        <div className="health-row"><span className="health-label">Attendance</span>
          <span className="health-val">{pctText(attendance.percent)} <Badge tone={att.tone}>{att.label}</Badge></span></div>
        <div className="health-row"><span className="health-label">Average score</span>
          <span className="health-val">{pctText(performance.average)} <Badge tone={sc.tone}>{sc.label}</Badge></span></div>
        <div className="health-row"><span className="health-label">Lowest subject</span>
          <span className="health-val">{performance.lowestSubject ? `${performance.lowestSubject.name} (${performance.lowestSubject.score}%)` : "—"}</span></div>
        <div className="health-row"><span className="health-label">Lowest attendance</span>
          <span className="health-val">{attendance.lowest ? `${attendance.lowest.name} (${attendance.lowest.pct}%)` : "—"}</span></div>
        <div className="health-row"><span className="health-label">Next exam</span>
          <span className="health-val">{nextExam ? `${nextExam.name} · ${nextExam.inDays} day${nextExam.inDays === 1 ? "" : "s"}` : "None scheduled"}</span></div>
        <div className="health-row"><span className="health-label">Fee status</span>
          <span className="health-val">{fees.total === 0 ? "—" : inr(fees.due) + " due"} {fees.total > 0 && <Badge tone={feeTone}>{FEE_STATUS_LABEL[fees.status]}</Badge>}</span></div>
      </div>
    </Card>
  );
}

export function FeeSnapshot({ fees }) {
  const pct = fees.total ? Math.round((fees.paid / fees.total) * 100) : null;
  return (
    <Card title="Fee status" actionTo="/fees" actionLabel="View fees">
      {fees.total === 0 ? <EmptyState icon="wallet" title="No fee records" /> : (
        <>
          <div className="health-row"><span className="health-label">Total</span><span className="health-val">{inr(fees.total)}</span></div>
          <div className="health-row"><span className="health-label">Paid</span><span className="health-val">{inr(fees.paid)}</span></div>
          {fees.pending > 0 && <div className="health-row"><span className="health-label">Awaiting verification</span><span className="health-val">{inr(fees.pending)}</span></div>}
          <div className="health-row"><span className="health-label">Outstanding</span><span className="health-val">{inr(fees.due)} <Badge tone={FEE_STATUS_TONE[fees.status]}>{FEE_STATUS_LABEL[fees.status]}</Badge></span></div>
          <div className="progress" style={{ marginTop: 10 }} role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Fees paid"><span style={{ width: `${pct ?? 0}%` }} /></div>
          <p className="chart-note">{safe(pct, 0)}% of fees paid</p>
        </>
      )}
    </Card>
  );
}

export function ActivityFeed({ rows, describe }) {
  return (
    <Card title="Recent activity" actionTo="/audit" actionLabel="Audit logs">
      {!rows?.length ? <EmptyState icon="clock" title="No recent activity" /> : (
        <ul className="feed">
          {rows.map((r) => (
            <li key={r.id}>
              <span className="notif-ico"><span aria-hidden="true">•</span></span>
              <div><div className="feed-title" style={{ fontWeight: 500 }}>{describe(r)}</div><div className="feed-meta">{timeAgo(r.created_at)}</div></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
