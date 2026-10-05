import { supabase } from "../supabaseClient";
import { listChildren } from "../queries/me";
import { todayISO } from "../dates";

const like = (q) => `%${q.replace(/[%_,]/g, " ").trim()}%`;
const ok = ({ data, error }) => { if (error) throw error; return data || []; };

/**
 * Role-aware search. Every query goes through Supabase RLS, so a user can
 * never get back a record they are not allowed to read; the per-role code
 * below additionally limits *what kinds* of things each role searches.
 */
export async function globalSearch(role, userId, term) {
  const q = (term || "").trim();
  if (q.length < 2) return [];
  const pat = like(q);
  const out = [];

  if (role === "admin") {
    const [people, classes, subjects] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, role").ilike("full_name", pat).in("role", ["student", "teacher", "parent"]).limit(8).then(ok),
      supabase.from("classes").select("id, name, section").or(`name.ilike.${pat},section.ilike.${pat}`).limit(5).then(ok),
      supabase.from("subjects").select("id, name, classes ( name, section )").ilike("name", pat).limit(6).then(ok),
    ]);
    people.forEach((p) => out.push({
      group: p.role === "student" ? "Students" : p.role === "teacher" ? "Teachers" : "Parents",
      id: p.id, title: p.full_name, subtitle: p.email,
      to: p.role === "student" ? `/students/${p.id}` : p.role === "teacher" ? `/teachers/${p.id}` : "/students",
    }));
    classes.forEach((c) => out.push({ group: "Classes", id: c.id, title: `Class ${c.name}-${c.section}`, subtitle: "Classes & subjects", to: "/classes" }));
    subjects.forEach((s) => out.push({ group: "Subjects", id: s.id, title: s.name, subtitle: s.classes ? `Class ${s.classes.name}-${s.classes.section}` : "", to: "/classes" }));
  } else if (role === "teacher") {
    const [mine, subjects] = await Promise.all([
      supabase.from("teacher_subjects").select("class_id, classes ( id, name, section ), subjects ( id, name )").eq("teacher_id", userId).then(ok),
      Promise.resolve([]),
    ]);
    void subjects;
    const classIds = [...new Set(mine.map((m) => m.class_id))];
    const needle = q.toLowerCase();
    mine.forEach((m) => {
      const cl = `${m.classes?.name}-${m.classes?.section}`;
      if (m.subjects?.name?.toLowerCase().includes(needle) || cl.toLowerCase().includes(needle)) {
        out.push({ group: "Classes & subjects", id: `${m.class_id}-${m.subjects?.id}`, title: `${cl} · ${m.subjects?.name}`, subtitle: "My classes", to: "/my-classes" });
      }
    });
    if (classIds.length) {
      const students = await supabase.from("students")
        .select("id, roll_no, class_id, classes ( name, section ), profiles!students_id_fkey ( full_name )")
        .in("class_id", classIds).then(ok);
      students
        .filter((s) => s.profiles?.full_name?.toLowerCase().includes(needle) || s.roll_no?.toLowerCase().includes(needle))
        .slice(0, 8)
        .forEach((s) => out.push({ group: "Students", id: s.id, title: s.profiles?.full_name, subtitle: `Class ${s.classes?.name}-${s.classes?.section} · Roll ${s.roll_no}`, to: "/my-classes" }));
    }
  } else {
    // student / parent: notices, events, subjects, and the child's own record
    let classId = null;
    let childLabel = null;
    if (role === "student") {
      const me = await supabase.from("students").select("class_id").eq("id", userId).maybeSingle().then(({ data }) => data);
      classId = me?.class_id || null;
    } else {
      const kids = await listChildren(userId);
      classId = kids[0]?.class_id || null;
      childLabel = kids.filter((k) => k.profiles?.full_name?.toLowerCase().includes(q.toLowerCase()));
    }
    const [notices, events, subjects] = await Promise.all([
      supabase.from("notices").select("id, title, created_at").ilike("title", pat).order("created_at", { ascending: false }).limit(5).then(ok),
      supabase.from("events").select("id, title, event_date").ilike("title", pat).gte("event_date", todayISO()).order("event_date").limit(5).then(ok),
      classId ? supabase.from("subjects").select("id, name").eq("class_id", classId).ilike("name", pat).limit(6).then(ok) : [],
    ]);
    (childLabel || []).forEach((k) => out.push({ group: "My child", id: k.id, title: k.profiles?.full_name, subtitle: `Class ${k.classes?.name}-${k.classes?.section}`, to: "/" }));
    notices.forEach((n) => out.push({ group: "Notices", id: n.id, title: n.title, subtitle: "", to: "/notices" }));
    events.forEach((e) => out.push({ group: "Events", id: e.id, title: e.title, subtitle: e.event_date, to: "/events" }));
    subjects.forEach((s) => out.push({ group: "Subjects", id: s.id, title: s.name, subtitle: "Timetable", to: "/timetable" }));
  }
  return out;
}
