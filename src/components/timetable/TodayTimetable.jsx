import React from "react";

import { DAY_NAMES, formatTime, timeToMinutes } from "../../lib/dates";
import Card from "../ui/Card";
import { EmptyState } from "../ui/States";
import Badge from "../ui/Badge";
import { dayStatus } from "./timetableLogic";
import { useNow } from "./useNow";

/**
 * Today's periods with a CURRENT CLASS / NEXT CLASS banner.
 * `entries` is the full week for the class (or teacher); we filter to today (IST).
 * `variant`: "student" shows teacher + room; "teacher" shows the class label.
 */
export default function TodayTimetable({ entries, variant = "student", title, actionTo = "/timetable" }) {
  const now = useNow();
  const today = (entries || []).filter((e) => e.day_of_week === now.dow);
  const st = dayStatus(today, now.minutes);
  const heading = title || `Today — ${DAY_NAMES[now.dow]}`;
  const subjectOf = (e) => e.subjects?.name || "Class";
  const detail = (e) => variant === "teacher"
    ? [e.classes ? `Class ${e.classes.name}-${e.classes.section}` : null, e.room].filter(Boolean).join(" · ")
    : [e.teachers?.profiles?.full_name, e.room].filter(Boolean).join(" · ");

  return (
    <Card title={heading} actionTo={actionTo} actionLabel="Full timetable">
      {today.length === 0 ? (
        <EmptyState icon="calendar" title={entries?.length ? "No classes today" : "No timetable available"}
          hint={entries?.length ? "Enjoy your day off." : "The timetable has not been published yet."} />
      ) : (
        <>
          {st.current ? (
            <div className="live-banner" role="status">
              <span className="live-tag">CURRENT CLASS</span>
              <strong>{subjectOf(st.current)}</strong>
              <span>ends in {st.minutesLeft} min</span>
            </div>
          ) : st.next ? (
            <div className="live-banner next" role="status">
              <span className="live-tag">NEXT CLASS</span>
              <strong>{subjectOf(st.next)}</strong>
              <span>starts in {st.minutesToNext >= 60 ? `${Math.floor(st.minutesToNext / 60)} h ${st.minutesToNext % 60} min` : `${st.minutesToNext} min`}</span>
            </div>
          ) : (
            <div className="live-banner next" role="status"><span>All classes for today are over.</span></div>
          )}
          <ul className="period-list">
            {st.rows.map((r, i) => {
              if (r.type === "break") {
                return (
                  <li key={`b${i}`} className="period break">
                    <span className="period-time">{formatTime(r.start)}</span>
                    <span>Break</span><span />
                  </li>
                );
              }
              const e = r.entry;
              const isCur = st.current?.id === e.id;
              const isNext = !st.current && st.next?.id === e.id;
              const done = now.minutes >= timeToMinutes(e.end_time);
              return (
                <li key={e.id} className={`period ${isCur ? "current" : ""} ${isNext ? "next" : ""} ${done ? "done" : ""}`} aria-current={isCur ? "true" : undefined}>
                  <span className="period-time">{formatTime(e.start_time)}<small>to {formatTime(e.end_time)}</small></span>
                  <span>
                    <span className="period-subject">{subjectOf(e)}</span>
                    <span className="period-meta" style={{ display: "block" }}>{detail(e)}</span>
                  </span>
                  {isCur ? <Badge tone="primary">Now</Badge> : isNext ? <Badge tone="info">Next</Badge> : done ? <Badge>Done</Badge> : <span />}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
