import React, { useMemo } from "react";

import { DAY_SHORT, formatTime24, timeToMinutes } from "../../lib/dates";
import { useNow } from "./useNow";

const DAYS = [1, 2, 3, 4, 5];

/**
 * Weekly grid, Mon-Fri. Rows are the distinct time slots found in the data
 * (so it adapts to any school's bell schedule); gaps between slots of 30+ min
 * render as BREAK rows. `mode="teacher"` shows class labels instead of teachers.
 */
export default function TimetableGrid({ entries, mode = "class", highlightSubjects = [] }) {
  const now = useNow();

  const { slots } = useMemo(() => {
    const keyed = new Map();
    entries.forEach((e) => keyed.set(`${e.start_time}|${e.end_time}`, { start: e.start_time, end: e.end_time }));
    const sorted = [...keyed.values()].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    const out = [];
    sorted.forEach((s, i) => {
      out.push({ type: "slot", ...s });
      const nxt = sorted[i + 1];
      if (nxt && timeToMinutes(nxt.start) - timeToMinutes(s.end) >= 30) out.push({ type: "break", start: s.end, end: nxt.start });
    });
    return { slots: out };
  }, [entries]);

  const find = (day, slot) => entries.find((e) => e.day_of_week === day && e.start_time === slot.start && e.end_time === slot.end);

  return (
    <div className="tt-wrap">
      <table className="tt-grid">
        <caption className="sr-only">Weekly timetable</caption>
        <thead>
          <tr>
            <th className="time-col" scope="col">Time</th>
            {DAYS.map((d) => <th key={d} scope="col" className={d === now.dow ? "today" : ""}>{DAY_SHORT[d]}{d === now.dow ? " (today)" : ""}</th>)}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, i) => slot.type === "break" ? (
            <tr key={`b${i}`}>
              <td className="time-col">{formatTime24(slot.start)}</td>
              <td className="tt-cell break" colSpan={5}>BREAK</td>
            </tr>
          ) : (
            <tr key={`${slot.start}${i}`}>
              <td className="time-col">{formatTime24(slot.start)}<br /><small>{formatTime24(slot.end)}</small></td>
              {DAYS.map((d) => {
                const e = find(d, slot);
                if (!e) return <td key={d} className="tt-cell tt-empty" />;
                const isCurrent = d === now.dow && now.minutes >= timeToMinutes(slot.start) && now.minutes < timeToMinutes(slot.end);
                const mine = highlightSubjects.includes(e.subjects?.name);
                return (
                  <td key={d} className={`tt-cell ${d === now.dow ? "today-col" : ""} ${isCurrent ? "current" : ""} ${mine ? "mine" : ""}`}
                    aria-current={isCurrent ? "true" : undefined}>
                    <div className="tt-subject">{e.subjects?.name || "Class"}</div>
                    <div className="tt-meta">
                      {mode === "teacher" ? (e.classes ? `${e.classes.name}-${e.classes.section}` : "") : (e.teachers?.profiles?.full_name || "")}
                    </div>
                    <div className="tt-meta">{e.room}</div>
                    {isCurrent && <div className="tt-meta" style={{ fontWeight: 700 }}>NOW</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
