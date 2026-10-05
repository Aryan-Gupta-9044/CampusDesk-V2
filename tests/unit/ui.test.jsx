import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeeLineCard } from "../../src/pages/shared/Fees";
import { deriveReport } from "../../src/lib/services/report";

const base = { fee_structure_id: "f1", fee_type: "Tuition Fee", amount: 50000, due_date: "2026-11-01", pending_payment_id: null, pending_date: null, pending_mode: null, pending_reference: null, last_rejection_reason: null, last_rejected_at: null };
const html = (l) => renderToStaticMarkup(<FeeLineCard line={{ ...base, ...l }} onPay={() => {}} />);

describe("FeeLineCard (Pay button state machine)", () => {
  it("Case 1: ₹50,000 fee, ₹30,000 paid, no pending -> Pay button visible", () => {
    const h = html({ confirmed_paid: 30000, pending_amount: 0, remaining: 20000, status: "partial", can_pay: true });
    expect(h).toContain("Pay ₹20,000"); expect(h).not.toContain("Awaiting verification");
  });
  it("Case 2: pending ₹10,000 -> Pay hidden, pending status + amount + date + mode + reference + explanation shown", () => {
    const h = html({ confirmed_paid: 30000, pending_amount: 10000, remaining: 20000, status: "pending_verification", pending_payment_id: "p1", pending_date: "2026-10-03", pending_mode: "UPI", pending_reference: "TXN-991", can_pay: false });
    expect(h).not.toContain("Pay ₹"); expect(h).toContain("disabled");
    for (const s of ["Payment awaiting verification", "₹10,000", "03 Oct 2026", "UPI", "TXN-991", "can&#x27;t submit another payment"]) expect(h).toContain(s);
    expect(h).toContain("₹30,000"); // confirmed paid unchanged
    expect(h).not.toContain("₹40,000");
  });
  it("Case 3: rejected -> Pay visible again with the reason", () => {
    const h = html({ confirmed_paid: 30000, pending_amount: 0, remaining: 20000, status: "rejected", last_rejection_reason: "Reference not found", last_rejected_at: "2026-10-02T10:00:00Z", can_pay: true });
    expect(h).toContain("Pay ₹20,000"); expect(h).toContain("Reference not found");
  });
  it("Case 4: approved -> remaining updated", () => {
    const h = html({ confirmed_paid: 40000, pending_amount: 0, remaining: 10000, status: "partial", can_pay: true });
    expect(h).toContain("₹40,000"); expect(h).toContain("Pay ₹10,000");
  });
  it("paid -> no Pay button", () => {
    const h = html({ confirmed_paid: 50000, pending_amount: 0, remaining: 0, status: "paid", can_pay: false });
    expect(h).not.toContain("Pay ₹"); expect(h).toContain("Fully paid");
  });
});

describe("deriveReport", () => {
  const raw = {
    student: { name: "A" },
    attendance: [{ subject: "Maths", present: 8, late: 1, absent: 1, leave: 2 }, { subject: "Physics", present: 5, late: 0, absent: 5, leave: 0 }],
    marks: [
      { exam: "UT1", exam_date: "2026-08-01", subject: "Maths", obtained: 45, max: 50, percentage: 90, grade: "A+" },
      { exam: "UT1", exam_date: "2026-08-01", subject: "Physics", obtained: 20, max: 50, percentage: 40, grade: "F" },
    ],
    results: [],
  };
  it("computes subject % and overall % with the shared policy", () => {
    const r = deriveReport(raw);
    expect(r.attendance[0].pct).toBe(90);            // (8+1)/(8+1+1)
    expect(r.attendance[0].total).toBe(12);          // includes leave in total sessions
    expect(r.overall.pct).toBe(70);                  // 14 / 20
  });
  it("finds best subject and the one needing attention; no NaN", () => {
    const r = deriveReport(raw);
    expect(r.best.subject).toBe("Maths"); expect(r.needsAttention.subject).toBe("Physics"); expect(r.averageScore).toBe(65);
    expect(JSON.stringify(r)).not.toMatch(/NaN|undefined/);
  });
  it("empty student does not crash", () => {
    const r = deriveReport({ student: { name: "B" }, attendance: [], marks: [], results: [] });
    expect(r.overall.pct).toBeNull(); expect(r.averageScore).toBeNull(); expect(r.best).toBeNull();
  });
});
