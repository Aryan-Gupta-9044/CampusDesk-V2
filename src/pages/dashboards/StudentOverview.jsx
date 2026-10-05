import React from "react";

import DashboardHeader from "../../components/dashboard/DashboardHeader";
import { DashboardFrame, DashboardSkeleton } from "../../components/dashboard/Section";
import {
  AcademicHealth, FeeSnapshot, RecentNotices, UpcomingEvents, UpcomingExams,
} from "../../components/dashboard/Widgets";
import {
  AttendanceTrendChart, ComparisonChart, ExamTrendChart, PercentBarChart,
} from "../../components/charts/Charts";
import TodayTimetable from "../../components/timetable/TodayTimetable";
import Card from "../../components/ui/Card";
import ActionRequired from "../../components/dashboard/ActionRequired";
import { EmptyState } from "../../components/ui/States";
import StatCard from "../../components/ui/StatCard";
import { useAsync } from "../../hooks/useAsync";
import { getStudentDashboardData } from "../../lib/services/studentData";
import { FEE_STATUS_LABEL, FEE_STATUS_TONE, attendanceStatus, scoreStatus } from "../../lib/metrics";
import { inr, pctText } from "../../lib/format";

/**
 * Shared by the Student dashboard (viewer = the student) and the Parent
 * dashboard (viewer = the parent looking at one child).
 */
export default function StudentOverview({ studentId, requesterId, viewer = "student" }) {
  const { data, loading, error, reload } = useAsync(
    () => getStudentDashboardData(studentId, requesterId), [studentId, requesterId], { enabled: !!studentId });

  const isParent = viewer === "parent";

  return (
    <DashboardFrame loading={loading} error={error} onRetry={reload} skeleton={<DashboardSkeleton />}>
      {!data?.student ? (
        <Card><EmptyState icon="user" title="No student record found" hint="Ask an administrator to link a student record to this account." /></Card>
      ) : (() => {
        const { student, attendance, performance, fees, notices, events, upcomingExams, nextExam, timetable } = data;
        const name = student.profiles?.full_name;
        const cls = student.classes ? `Class ${student.classes.name}-${student.classes.section}` : "No class assigned";
        const att = attendanceStatus(attendance.percent);
        const sc = scoreStatus(performance.average);
        const trendHint = attendance.trendDelta == null ? "" : `${attendance.trendDelta >= 0 ? "+" : ""}${attendance.trendDelta}% vs last week`;
        return (
          <>
            <DashboardHeader
              name={isParent ? undefined : name?.split(" ")[0]}
              subtitle={isParent ? `${name} · ${cls} · Roll No. ${student.roll_no || "—"}` : `${cls} • Roll No. ${student.roll_no || "—"}`}
            />
            {isParent && <h1 className="sr-only">{name}</h1>}
            <ActionRequired items={data.actions} />
            <div className="stat-grid">
              <StatCard label="Attendance" icon="check" tone={att.tone} value={pctText(attendance.percent)} status={att} hint={trendHint} />
              <StatCard label={isParent ? "Average marks" : "Average score"} icon="chart" tone={sc.tone} value={pctText(performance.average)} status={sc}
                hint={performance.lowestSubject ? `Lowest: ${performance.lowestSubject.name}` : ""} />
              <StatCard label="Fees" icon="wallet" tone={FEE_STATUS_TONE[fees.status]}
                value={fees.total === 0 ? "—" : fees.due > 0 ? `${inr(fees.due)} due` : "All paid"}
                status={fees.total === 0 ? null : { label: FEE_STATUS_LABEL[fees.status], tone: FEE_STATUS_TONE[fees.status] }}
                hint={fees.pending > 0 ? `${inr(fees.pending)} pending verification` : ""} />
              {isParent ? (
                <StatCard label="Next exam" icon="book" tone="info" value={nextExam ? `${nextExam.inDays} days` : "—"} hint={nextExam?.name || "None scheduled"} />
              ) : (
                <StatCard label="Pending tasks" icon="alert" tone={data.pendingTasks ? "warning" : "success"} value={String(data.pendingTasks)}
                  hint={data.pendingTasks ? `${data.pendingBreakdown.fees} fee item(s), ${data.pendingBreakdown.leave} leave request(s)` : "Nothing pending"} />
              )}
            </div>

            <div className="grid-main">
              <TodayTimetable entries={timetable} title={undefined} />
              <div className="stack">
                <AcademicHealth attendance={attendance} performance={performance} nextExam={nextExam} fees={fees} />
                {!isParent && <UpcomingExams exams={upcomingExams} />}
              </div>
            </div>

            <div className="grid-2">
              <Card title="Attendance trend" subtitle="How is attendance changing week to week?">
                <AttendanceTrendChart data={attendance.trend} />
              </Card>
              <Card title="Exam performance" subtitle={performance.hasClassAverage ? "Your score vs class average" : "Your score across exams"}>
                <ExamTrendChart data={performance.examSeries} />
              </Card>
            </div>

            <div className="grid-2">
              <Card title="Subject performance" subtitle="Average across all published exams">
                <PercentBarChart data={performance.subjectScores} nameKey="name" valueKey="score" />
              </Card>
              <Card title="Subject attendance" subtitle="Where is attendance lowest?">
                <PercentBarChart data={attendance.subjects} nameKey="name" valueKey="pct" color="var(--chart-2)" label="Attendance" />
              </Card>
            </div>

            <div className="grid-2">
              <Card title="You vs class average" subtitle={performance.latestExamName ? `${performance.latestExamName} · aggregate class average only` : "Latest exam"}>
                <ComparisonChart data={performance.subjectVsClass} xKey="subject" studentLabel={isParent ? "Your child" : "You"} />
              </Card>
              {isParent ? <UpcomingExams exams={upcomingExams} /> : <FeeSnapshot fees={fees} />}
            </div>

            <div className="grid-2">
              <RecentNotices notices={notices} />
              <UpcomingEvents events={events} />
            </div>
            {isParent && <FeeSnapshot fees={fees} />}
          </>
        );
      })()}
    </DashboardFrame>
  );
}
