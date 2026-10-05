import { timeToMinutes } from "../../lib/dates";

/** Live state of one day's periods: which is current, which is next, and break gaps. */
export function dayStatus(entries, nowMinutes) {
  const sorted = [...entries].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  let current = null; let next = null;
  for (const e of sorted) {
    const s = timeToMinutes(e.start_time); const en = timeToMinutes(e.end_time);
    if (nowMinutes >= s && nowMinutes < en) current = e;
    else if (nowMinutes < s && !next) next = e;
  }
  const rows = [];
  sorted.forEach((e, i) => {
    rows.push({ type: "period", entry: e });
    const nxt = sorted[i + 1];
    if (nxt && timeToMinutes(nxt.start_time) - timeToMinutes(e.end_time) >= 30) {
      rows.push({ type: "break", start: e.end_time, end: nxt.start_time });
    }
  });
  return { sorted, current, next, rows, minutesToNext: next ? timeToMinutes(next.start_time) - nowMinutes : null, minutesLeft: current ? timeToMinutes(current.end_time) - nowMinutes : null };
}
