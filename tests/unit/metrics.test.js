import { describe, expect, it } from "vitest";
import { attendancePct, canPayLine, pctFromCounts, summarizeFeeLines, weeklyAttendanceTrend } from "../../src/lib/metrics";
import { pctText } from "../../src/lib/format";
import { friendlyError } from "../../src/lib/errors";
import { toCsv } from "../../src/lib/csv";
import { buildStudentActions } from "../../src/lib/actions";

const line = (o) => ({ fee_structure_id: "f1", fee_type: "Tuition", amount: 50000, confirmed_paid: 0, pending_amount: 0, remaining: 50000, status: "due", pending_payment_id: null, ...o });

describe("attendance policy (present + late attended; absent counted; leave excluded)", () => {
  it("counts late as attended", () => expect(pctFromCounts({ present: 6, late: 2, absent: 2 })).toBe(80));
  it("excludes approved leave from the denominator", () => expect(attendancePct([{ status: "present" }, { status: "leave" }, { status: "leave" }])).toBe(100));
  it("returns null (never NaN / 0) when nothing is countable", () => { expect(attendancePct([])).toBeNull(); expect(attendancePct([{ status: "leave" }])).toBeNull(); expect(pctText(null)).toBe("—"); });
  it("dashboard rows and report counts give the same number", () => {
    const rows = [..."pppplaaaaa"].map((c) => ({ status: { p: "present", l: "late", a: "absent" }[c] }));
    expect(attendancePct(rows)).toBe(pctFromCounts({ present: 4, late: 1, absent: 5 }));
  });
  it("weekly trend uses the same definition", () => {
    const t = weeklyAttendanceTrend([{ date: new Date().toISOString().slice(0, 10), status: "late" }], 4);
    expect(t[3].pct).toBe(100);
  });
});

describe("fee model: only CONFIRMED payments reduce the balance", () => {
  it("Fee 50,000 / paid 30,000 / pending 10,000 -> remaining 20,000, not 10,000", () => {
    const s = summarizeFeeLines([line({ confirmed_paid: 30000, pending_amount: 10000, remaining: 20000, status: "pending_verification", pending_payment_id: "p1" })]);
    expect([s.total, s.paid, s.pending, s.due]).toEqual([50000, 30000, 10000, 20000]);
    expect(s.status).toBe("pending_verification");
  });
  it("Case 1: paid 30,000, no pending -> Pay available", () => expect(canPayLine(line({ confirmed_paid: 30000, remaining: 20000, status: "partial" }))).toBe(true));
  it("Case 2: pending exists -> Pay NOT available", () => expect(canPayLine(line({ confirmed_paid: 30000, pending_amount: 10000, remaining: 20000, status: "pending_verification", pending_payment_id: "p1" }))).toBe(false));
  it("Case 3: pending rejected -> Pay available again", () => expect(canPayLine(line({ confirmed_paid: 30000, remaining: 20000, status: "partial", pending_amount: 0 }))).toBe(true));
  it("Case 4: pending approved -> remaining updated", () => {
    const s = summarizeFeeLines([line({ confirmed_paid: 40000, remaining: 10000, status: "partial" })]);
    expect(s.due).toBe(10000); expect(s.pending).toBe(0);
  });
  it("fully paid -> Pay unavailable", () => expect(canPayLine(line({ confirmed_paid: 50000, remaining: 0, status: "paid" }))).toBe(false));
  it("Pay must not rely on remaining > 0 alone", () => expect(canPayLine(line({ remaining: 20000, pending_amount: 5000 }))).toBe(false));
});

describe("student 'Action required'", () => {
  it("flags low attendance, pending payment, exam tomorrow, pending leave", () => {
    const items = buildStudentActions({ attendancePercent: 70, feeLines: [line({ status: "pending_verification", pending_amount: 10000, remaining: 20000, pending_payment_id: "p" })], nextExam: { name: "Final", inDays: 1 }, pendingLeave: 1 });
    expect(items.map((i) => i.key)).toEqual(["att", "pend-f1", "exam", "leave"]);
  });
  it("is empty when nothing needs attention", () => expect(buildStudentActions({ attendancePercent: 95, feeLines: [], nextExam: null })).toEqual([]));
});

describe("friendly errors / csv", () => {
  it("maps database codes to sentences", () => {
    expect(friendlyError({ message: "campusdesk:pending_exists" })).toMatch(/awaiting verification/);
    expect(friendlyError({ message: "campusdesk:exceeds_remaining" })).toMatch(/remaining balance/);
    expect(friendlyError({ code: "23505", message: "duplicate key" })).toMatch(/already exists/);
    expect(friendlyError({ message: "PostgrestException 23505 weird" }, "Try again.")).not.toMatch(/Postgrest/);
  });
  it("neutralises spreadsheet formula injection and quotes commas", () => {
    expect(toCsv(["a"], [["=SUM(A1)"], ["x,y"]])).toBe("a\r\n'=SUM(A1)\r\n\"x,y\"");
  });
});
