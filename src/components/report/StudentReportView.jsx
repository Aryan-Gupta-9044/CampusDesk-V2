import React from "react";
import { Link } from "react-router-dom";

import { useAsync } from "../../hooks/useAsync";
import { getStudentReport } from "../../lib/services/report";
import { getFeeLines } from "../../lib/services/fees";
import { attendanceStatus, scoreStatus, summarizeFeeLines, FEE_STATUS_LABEL } from "../../lib/metrics";
import { exportCsv } from "../../lib/csv";
import { formatDate, formatDateTime } from "../../lib/dates";
import { inr, pctText, safe } from "../../lib/format";
import { friendlyError } from "../../lib/errors";
import Badge from "../ui/Badge";
import { SkeletonCard } from "../ui/Skeleton";
import { EmptyState, ErrorState } from "../ui/States";

const KV = ({ k, v }) => <div><span className="k">{k}</span><span>{safe(v)}</span></div>;

/** Professional printable academic report. All numbers come from get_student_report() + shared metrics. */
export default function StudentReportView({ studentId, backTo }) {
  const { data: r, loading, error, reload } = useAsync(() => getStudentReport(studentId), [studentId], { enabled: !!studentId });
  const fees = useAsync(() => getFeeLines(studentId).then(summarizeFeeLines), [studentId], { enabled: !!studentId });

  if (!studentId) return <EmptyState icon="user" title="No student selected" />;
  if (loading) return <SkeletonCard height={420} />;
  if (error) return <ErrorState message={friendlyError(error, "Unable to load the academic report.")} onRetry={reload} />;

  const s = r.student; const ct = r.class_teacher; const g = r.guardian;
  const att = attendanceStatus(r.overall.pct); const sc = scoreStatus(r.averageScore);

  const exportMarks = () => exportCsv(`report-${s.student_code || s.roll_no}.csv`,
    ["Subject", "Exam", "Marks", "Maximum", "Percentage", "Grade"],
    r.marks.map((m) => [m.subject, m.exam, m.obtained, m.max, m.percentage, m.grade]));

  return (
    <div className="page">
      <div className="page-head no-print">
        <div><h1>Academic report</h1><p>{s.name}</p></div>
        <div className="quick-actions">
          {backTo && <Link className="btn btn-outline btn-sm" to={backTo}>← Back</Link>}
          <button type="button" className="btn btn-outline btn-sm" onClick={exportMarks} disabled={!r.marks.length}>Export marks (CSV)</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>

      <article className="report-sheet" aria-label="Student academic report">
        <header className="report-head">
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="report-logo" aria-hidden="true">LOGO</div>
            <div><div style={{ fontWeight: 800, fontSize: 18 }}>CampusDesk</div><div className="feed-meta">School Management System</div></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h1>Student Academic Report</h1>
            <div className="feed-meta">Academic Year {safe(s.academic_year)}</div>
          </div>
        </header>

        <h2>Student</h2>
        <dl className="kv">
          <KV k="Name" v={s.name} /><KV k="Student ID" v={s.student_code} />
          <KV k="Roll no." v={s.roll_no} /><KV k="Class" v={s.class_name ? `${s.class_name}-${s.section}` : null} />
          <KV k="Section" v={s.section} /><KV k="Academic year" v={s.academic_year} />
          <KV k="Email" v={s.email} /><KV k="Phone" v={s.phone} />
          <KV k="Date of birth" v={s.dob ? formatDate(s.dob) : null} /><KV k="Gender" v={s.gender} />
        </dl>

        <h2>Class teacher</h2>
        {ct ? <dl className="kv"><KV k="Name" v={ct.name} /><KV k="Teacher ID" v={ct.teacher_code} /><KV k="Email" v={ct.email} /><KV k="Phone" v={ct.phone} /></dl>
          : <p className="feed-meta">No class teacher assigned.</p>}

        <h2>Parent / Guardian</h2>
        {g ? <dl className="kv"><KV k="Name" v={g.name} /><KV k="Email" v={g.email} /><KV k="Phone" v={g.phone} /></dl>
          : <p className="feed-meta">No parent or guardian linked.</p>}

        <h2>Academic summary</h2>
        <div className="summary-strip">
          <div><small>Overall attendance</small><b>{pctText(r.overall.pct)}</b><Badge tone={att.tone}>{att.label}</Badge></div>
          <div><small>Average score</small><b>{pctText(r.averageScore)}</b><Badge tone={sc.tone}>{sc.label}</Badge></div>
          <div><small>Best subject</small><b style={{ fontSize: 15 }}>{r.best ? r.best.subject : "—"}</b><small>{r.best ? `${r.best.avg}%` : "No marks yet"}</small></div>
          <div><small>Needs attention</small><b style={{ fontSize: 15 }}>{r.needsAttention ? r.needsAttention.subject : "—"}</b><small>{r.needsAttention ? `${r.needsAttention.avg}%` : ""}</small></div>
          {fees.data && fees.data.total > 0 && <div><small>Fees</small><b>{inr(fees.data.due)} due</b><small>{FEE_STATUS_LABEL[fees.data.status]}{fees.data.pending ? ` · ${inr(fees.data.pending)} pending` : ""}</small></div>}
        </div>

        <h2>Attendance</h2>
        {r.attendance.length === 0 ? <p className="feed-meta">No attendance recorded yet.</p> : (
          <div className="table-wrap"><table className="rep">
            <thead><tr><th>Subject</th><th className="num">Present</th><th className="num">Late</th><th className="num">Absent</th><th className="num">Leave</th><th className="num">Total</th><th className="num">%</th></tr></thead>
            <tbody>
              {r.attendance.map((a) => <tr key={a.subject}><td>{a.subject}</td><td className="num">{a.present}</td><td className="num">{a.late}</td><td className="num">{a.absent}</td><td className="num">{a.leave}</td><td className="num">{a.total}</td><td className="num">{pctText(a.pct)}</td></tr>)}
              <tr style={{ fontWeight: 700 }}><td>Overall</td><td className="num">{r.overall.present}</td><td className="num">{r.overall.late}</td><td className="num">{r.overall.absent}</td><td className="num">{r.overall.leave}</td><td className="num">{r.overall.total}</td><td className="num">{pctText(r.overall.pct)}</td></tr>
            </tbody></table></div>)}
        <p className="feed-meta">Attendance % = (present + late) ÷ (present + late + absent). Approved leave is excluded.</p>

        <h2>Academic performance</h2>
        {r.marks.length === 0 ? <p className="feed-meta">No published results yet.</p> : (
          <div className="table-wrap"><table className="rep">
            <thead><tr><th>Subject</th><th>Exam</th><th className="num">Marks</th><th className="num">Maximum</th><th className="num">Percentage</th><th>Grade</th></tr></thead>
            <tbody>{r.marks.map((m, i) => <tr key={i}><td>{m.subject}</td><td>{m.exam}</td><td className="num">{m.obtained}</td><td className="num">{m.max}</td><td className="num">{pctText(m.percentage)}</td><td>{safe(m.grade)}</td></tr>)}</tbody></table></div>)}

        {r.results.length > 0 && (<>
          <h2>Exam-wise results</h2>
          <div className="table-wrap"><table className="rep">
            <thead><tr><th>Exam</th><th>Term</th><th className="num">Total</th><th className="num">Percentage</th><th>Grade</th><th className="num">Class rank</th></tr></thead>
            <tbody>{r.results.map((x, i) => <tr key={i}><td>{x.exam}</td><td>{safe(x.term)}</td><td className="num">{safe(x.total)}</td><td className="num">{pctText(x.percentage)}</td><td>{safe(x.grade)}</td><td className="num">{safe(x.rank)}</td></tr>)}</tbody></table></div>
        </>)}

        {r.subjectAverages.length > 0 && (<>
          <h2>Subject-wise performance</h2>
          <div className="table-wrap"><table className="rep">
            <thead><tr><th>Subject</th><th className="num">Average</th><th>Indicator</th></tr></thead>
            <tbody>{r.subjectAverages.map((x) => { const st = scoreStatus(x.avg); return <tr key={x.subject}><td>{x.subject}</td><td className="num">{pctText(x.avg)}</td><td>{st.label}</td></tr>; })}</tbody></table></div>
        </>)}

        <footer className="report-foot"><span>Generated {formatDateTime(r.generated_at)}</span><span>Only published results are included for students and parents.</span></footer>
      </article>
    </div>
  );
}
