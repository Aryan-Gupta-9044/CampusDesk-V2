import React from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useAsync } from "../../hooks/useAsync";
import { supabase } from "../../lib/supabaseClient";
import { listTeacherAssignments } from "../../lib/services/teacherData";
import Card from "../../components/ui/Card";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/States";

async function load(teacherId) {
  const assignments = await listTeacherAssignments(teacherId);
  const classIds = [...new Set(assignments.map((a) => a.class_id))];
  let students = [];
  if (classIds.length) {
    const { data, error } = await supabase.from("students")
      .select("id, roll_no, class_id, profiles!students_id_fkey ( full_name )").in("class_id", classIds).order("roll_no");
    if (error) throw error;
    students = data || [];
  }
  return classIds.map((id) => {
    const rows = assignments.filter((a) => a.class_id === id);
    return { id, label: `${rows[0].classes.name}-${rows[0].classes.section}`, subjects: rows.map((r) => r.subjects?.name), students: students.filter((s) => s.class_id === id) };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

export default function MyClasses() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => load(user.id), [user.id]);
  return (
    <div className="page">
      <div className="page-head"><div><h1>My classes</h1><p>Classes and students you teach</p></div>
        <div className="quick-actions"><Link className="btn btn-outline btn-sm" to="/attendance">Mark attendance</Link><Link className="btn btn-outline btn-sm" to="/results">Enter marks</Link></div></div>
      {loading ? <SkeletonCard height={200} /> : error ? <Card><ErrorState message="Unable to load your classes." onRetry={reload} /></Card>
        : !data.length ? <Card><EmptyState icon="users" title="No classes assigned" hint="An administrator assigns you to classes and subjects." /></Card>
        : <div className="grid-2">{data.map((c) => (
          <Card key={c.id} title={`Class ${c.label}`} subtitle={`${c.subjects.join(", ")} · ${c.students.length} students`}>
            <ul className="feed">{c.students.map((s) => (
              <li key={s.id}><div><div className="feed-title" style={{ fontWeight: 500 }}>{s.profiles?.full_name}</div><div className="feed-meta">Roll {s.roll_no}</div></div></li>
            ))}</ul>
          </Card>))}</div>}
    </div>
  );
}
