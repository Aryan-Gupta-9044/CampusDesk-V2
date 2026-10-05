import { daysUntil } from "./dates";
import { inr } from "./format";

/** "Action required" items for a student/parent dashboard. Pure function (unit-tested). */
export function buildStudentActions({ attendancePercent, feeLines = [], nextExam, pendingLeave = 0, threshold = 75 }) {
  const out = [];
  if (attendancePercent != null && attendancePercent < threshold) {
    out.push({ key: "att", tone: "danger", text: `Attendance is ${attendancePercent}% — below the ${threshold}% requirement`, to: "/attendance" });
  }
  feeLines.forEach((l) => {
    if (l.status === "pending_verification") out.push({ key: `pend-${l.fee_structure_id}`, tone: "info", text: `${inr(l.pending_amount)} payment for ${l.fee_type} is awaiting verification`, to: "/fees" });
    else if (l.status === "rejected" && Number(l.remaining) > 0) out.push({ key: `rej-${l.fee_structure_id}`, tone: "danger", text: `Payment for ${l.fee_type} was rejected — submit it again`, to: "/fees" });
    else if (Number(l.remaining) > 0 && l.due_date) {
      const d = daysUntil(l.due_date);
      if (d != null && d < 0) out.push({ key: `over-${l.fee_structure_id}`, tone: "danger", text: `${l.fee_type}: ${inr(l.remaining)} overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"}`, to: "/fees" });
      else if (d != null && d <= 7) out.push({ key: `soon-${l.fee_structure_id}`, tone: "warning", text: `${l.fee_type}: ${inr(l.remaining)} due ${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}`, to: "/fees" });
    }
  });
  if (nextExam && nextExam.inDays != null && nextExam.inDays >= 0 && nextExam.inDays <= 7) {
    out.push({ key: "exam", tone: "warning", text: `${nextExam.name} ${nextExam.inDays === 0 ? "is today" : nextExam.inDays === 1 ? "is tomorrow" : `starts in ${nextExam.inDays} days`}`, to: "/timetable" });
  }
  if (pendingLeave > 0) out.push({ key: "leave", tone: "info", text: `${pendingLeave} leave request${pendingLeave === 1 ? "" : "s"} awaiting a decision`, to: "/leave" });
  return out;
}
