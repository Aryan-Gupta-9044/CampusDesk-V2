import { supabase } from "../supabaseClient";

export async function listRecentActivity(role, userId) {
  const [{ data: notices }, { data: events }] = await Promise.all([
    supabase.from("notices").select("id, title, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("events").select("id, title, event_date").gte("event_date", new Date().toISOString().slice(0, 10)).order("event_date").limit(5),
  ]);

  const items = [
    ...(notices || []).map((n) => ({ id: `notice-${n.id}`, type: "Notice", title: n.title, when: n.created_at, link: "/notices" })),
    ...(events || []).map((e) => ({ id: `event-${e.id}`, type: "Event", title: e.title, when: e.event_date, link: "/events" })),
  ];

  if (role === "admin") {
    const { data: pending } = await supabase
      .from("fee_payments")
      .select("id, amount_paid, payment_date")
      .eq("status", "pending_verification")
      .order("payment_date", { ascending: false })
      .limit(5);
    (pending || []).forEach((p) =>
      items.push({ id: `fee-${p.id}`, type: "Payment to verify", title: `₹${p.amount_paid} submitted for verification`, when: p.payment_date, link: "/fees" })
    );
  }

  if (role === "teacher") {
    const { data: queries } = await supabase
      .from("teacher_queries")
      .select("id, message, created_at")
      .eq("teacher_id", userId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(5);
    (queries || []).forEach((q) =>
      items.push({ id: `query-${q.id}`, type: "New query", title: q.message.slice(0, 60), when: q.created_at, link: "/chat" })
    );
  }

  if (role === "student" || role === "parent") {
    const { data: decisions } = await supabase
      .from("leave_requests")
      .select("id, status, from_date")
      .eq("requester_id", userId)
      .neq("status", "pending")
      .order("from_date", { ascending: false })
      .limit(5);
    (decisions || []).forEach((d) =>
      items.push({ id: `leave-${d.id}`, type: "Leave update", title: `Your leave on ${d.from_date} was ${d.status}`, when: d.from_date, link: "/leave" })
    );
  }

  items.sort((a, b) => new Date(b.when) - new Date(a.when));
  return items;
}
