import { addDays, todayISO, weekStart } from "./dates";

// ATTENDANCE POLICY (identical to SQL attendance_percent()):
//   attended = present + late
//   counted  = present + late + absent      ('leave' = excused, not counted)
//   percent  = round(100 * attended / counted), null when nothing is counted
export const ATTENDED = ["present", "late"];
export const COUNTED = ["present", "late", "absent"];
export const isAttended = (status) => ATTENDED.includes(status);

export function pctFromCounts({ present = 0, late = 0, absent = 0 } = {}) {
  const counted = Number(present) + Number(late) + Number(absent);
  if (counted === 0) return null;
  return Math.round((100 * (Number(present) + Number(late))) / counted);
}

/** rows: [{ status }]. null when there are no countable records. */
export function attendancePct(rows) {
  const c = { present: 0, late: 0, absent: 0 };
  (rows || []).forEach((r) => { if (r.status in c) c[r.status] += 1; });
  return pctFromCounts(c);
}

export function attendanceStatus(p) {
  if (p == null) return { label: "No data", tone: "muted" };
  if (p >= 90) return { label: "Healthy", tone: "success" };
  if (p >= 75) return { label: "Needs attention", tone: "warning" };
  return { label: "At risk", tone: "danger" };
}

export function scoreStatus(p) {
  if (p == null) return { label: "No data", tone: "muted" };
  if (p >= 90) return { label: "Excellent", tone: "success" };
  if (p >= 75) return { label: "Good", tone: "success" };
  if (p >= 60) return { label: "Fair", tone: "warning" };
  return { label: "Needs work", tone: "danger" };
}

export function mean(values) {
  const v = values.filter((x) => x != null && !Number.isNaN(Number(x))).map(Number);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export const markPct = (m) => (Number(m.max_marks) > 0 ? (Number(m.marks_obtained) / Number(m.max_marks)) * 100 : null);

/** Attendance % for each of the last `weeks` weeks (oldest first). */
export function weeklyAttendanceTrend(rows, weeks = 4) {
  const thisWeek = weekStart(todayISO());
  const starts = Array.from({ length: weeks }, (_, i) => addDays(thisWeek, -7 * (weeks - 1 - i)));
  return starts.map((s, i) => {
    const e = addDays(s, 7);
    const inWeek = rows.filter((r) => r.date >= s && r.date < e);
    return { label: `Week ${i + 1}`, weekOf: s, pct: attendancePct(inWeek), records: inWeek.length };
  });
}

/** Group rows by subject name -> [{ name, pct, total }] sorted by name. */
export function groupAttendanceBySubject(rows) {
  const map = {};
  rows.forEach((r) => {
    const name = r.subjects?.name || "Other";
    (map[name] = map[name] || []).push(r);
  });
  return Object.entries(map)
    .map(([name, list]) => ({ name, pct: attendancePct(list), total: list.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Totals across the lines returned by the database function get_fee_summary().
 * Only CONFIRMED payments reduce the balance; pending amounts are shown separately.
 */
export function summarizeFeeLines(lines) {
  const items = (lines || []).map((l) => ({
    ...l,
    amount: Number(l.amount), confirmed_paid: Number(l.confirmed_paid),
    pending_amount: Number(l.pending_amount), remaining: Number(l.remaining),
  }));
  const total = items.reduce((a, i) => a + i.amount, 0);
  const paid = items.reduce((a, i) => a + i.confirmed_paid, 0);
  const pending = items.reduce((a, i) => a + i.pending_amount, 0);
  const due = items.reduce((a, i) => a + i.remaining, 0);
  const unpaidCount = items.filter((i) => i.remaining > 0).length;
  let status = "due";
  if (total > 0 && due === 0) status = "paid";
  else if (items.some((i) => i.status === "pending_verification")) status = "pending_verification";
  else if (paid > 0) status = "partial";
  else if (items.some((i) => i.status === "rejected")) status = "rejected";
  return { items, total, paid, pending, due, unpaidCount, status };
}

/** The Pay button rule: balance left AND no request already awaiting verification. */
export function canPayLine(line) {
  return Number(line.remaining) > 0 && !line.pending_payment_id && Number(line.pending_amount || 0) === 0;
}

export const FEE_STATUS_LABEL = {
  paid: "Paid", partial: "Partially paid", due: "Due",
  pending_verification: "Awaiting verification", rejected: "Rejected",
};
export const FEE_STATUS_TONE = {
  paid: "success", partial: "warning", due: "danger", pending_verification: "info", rejected: "danger",
};
