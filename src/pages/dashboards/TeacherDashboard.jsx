import React from "react";

import DashboardHeader from "../../components/dashboard/DashboardHeader";
import { DashboardFrame, DashboardSkeleton } from "../../components/dashboard/Section";
import { RecentNotices, UpcomingEvents } from "../../components/dashboard/Widgets";
import { AttendanceTrendChart, ClassBarChart, ExamTrendChart, PercentBarChart } from "../../components/charts/Charts";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/States";
import StatCard from "../../components/ui/StatCard";
import { useAuth } from "../../context/AuthContext";
import { useAsync } from "../../hooks/useAsync";
import { useNow } from "../../components/timetable/useNow";
import { formatTime, timeToMinutes } from "../../lib/dates";
import { getTeacherDashboardData } from "../../lib/services/teacherData";

const STATUS = {
  completed: { label: "Completed", tone: "success" },
  in_progress: { label: "In progress", tone: "primary" },
  attendance_pending: { label: "Attendance pending", tone: "warning" },
  upcoming: { label: "Upcoming", tone: "muted" },
};

export default function TeacherDashboard() {
  const { user } = useAuth();
  const now = useNow();
  const { data, loading, error, reload } = useAsync(() => getTeacherDashboardData(user.id), [user.id]);

  return (
    <DashboardFrame loading={loading} error={error} onRetry={reload} skeleton={<DashboardSkeleton />}>
      {data && (() => {
        const { teacher, kpis, todaysClasses, pendingMarks, analytics, notices, events, assignments } = data;
        const subjects = [...new Set(assignments.map((a) => a.subjects?.name).filter(Boolean))];
        const sub = [subjects.join(", "), teacher?.department && `${teacher.department} department`].filter(Boolean).join(" · ");
        return (
          <>
            <DashboardHeader
              name={teacher?.profiles?.full_name?.split(" ")[0]}
              subtitle={sub || "Teacher"}
              actions={[
                { label: "Mark Attendance", to: "/attendance" }, { label: "Enter Marks", to: "/results" },
                { label: "Post Notice", to: "/notices" }, { label: "Student Queries", to: "/chat" },
              ]}
            />
            <div className="stat-grid">
              <StatCard label="Classes today" icon="calendar" tone="primary" value={String(kpis.classesToday)} />
              <StatCard label="Students today" icon="users" tone="info" value={String(kpis.studentsToday)} />
              <StatCard label="Pending attendance" icon="check" tone={kpis.pendingAttendance ? "warning" : "success"} value={String(kpis.pendingAttendance)}
                hint={kpis.pendingAttendance ? "Classes held, not marked" : "All marked"} />
              <StatCard label="Pending marks" icon="book" tone={kpis.pendingMarks ? "warning" : "success"} value={String(kpis.pendingMarks)}
                hint={kpis.pendingMarks ? "Exam/class sets incomplete" : "Up to date"} />
              <StatCard label="Student queries" icon="message" tone={kpis.openQueries ? "info" : "muted"} value={String(kpis.openQueries)} hint="Awaiting reply" />
            </div>

            <div className="grid-main">
              <Card title="Today's classes" actionTo="/timetable" actionLabel="My timetable">
                {todaysClasses.length === 0 ? <EmptyState icon="calendar" title="No classes today" /> : (
                  <ul className="period-list">
                    {todaysClasses.map((c) => {
                      const st = STATUS[c.status];
                      const cur = now.minutes >= timeToMinutes(c.start_time) && now.minutes < timeToMinutes(c.end_time);
                      return (
                        <li key={c.id} className={`period ${cur ? "current" : ""}`}>
                          <span className="period-time">{formatTime(c.start_time)}<small>to {formatTime(c.end_time)}</small></span>
                          <span><span className="period-subject">{c.label} · {c.subjects?.name}</span>
                            <span className="period-meta" style={{ display: "block" }}>{c.room || "Room TBA"} · {c.studentCount} students</span></span>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              <Card title="Pending academic work" subtitle="Marks still to enter">
                {pendingMarks.length === 0 ? <EmptyState icon="check" title="Nothing pending" hint="All marks are entered." /> : (
                  <ul className="feed">
                    {pendingMarks.slice(0, 6).map((p, i) => (
                      <li key={i}><div><div className="feed-title">{p.label}</div><div className="feed-meta">{p.exam} · {p.missing} student{p.missing === 1 ? "" : "s"} missing</div></div></li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="grid-2">
              <Card title="Class attendance" subtitle="Last 28 days, by class and subject">
                <PercentBarChart data={analytics.classPerformance} nameKey="label" valueKey="attendancePct" color="var(--chart-2)" label="Attendance" />
              </Card>
              <Card title="Class average performance" subtitle="Average marks across all exams">
                <PercentBarChart data={analytics.classPerformance} nameKey="label" valueKey="avgMarksPct" label="Average marks" />
              </Card>
            </div>
            <div className="grid-2">
              <Card title="Attendance trend" subtitle="Across my classes">
                <AttendanceTrendChart data={analytics.attendanceTrend} />
              </Card>
              <Card title="Performance by exam" subtitle="Average marks in my subjects">
                <ExamTrendChart data={analytics.examPerformance.map((e) => ({ exam: e.exam, student: e.avg }))} />
              </Card>
            </div>
            <div className="grid-2">
              <RecentNotices notices={notices} />
              <UpcomingEvents events={events} />
            </div>
          </>
        );
      })()}
    </DashboardFrame>
  );
}
