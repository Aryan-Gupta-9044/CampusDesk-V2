import React, { useMemo, useState } from "react";

import { useAsync } from "../../hooks/useAsync";
import { supabase } from "../../lib/supabaseClient";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/States";

async function load() {
  const [{ data: parents, error: e1 }, { data: kids, error: e2 }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone, status").eq("role", "parent").order("full_name"),
    supabase.from("students").select("id, roll_no, parent_id, classes ( name, section ), profiles!students_id_fkey ( full_name )").not("parent_id", "is", null),
  ]);
  if (e1 || e2) throw e1 || e2;
  return (parents || []).map((p) => ({ ...p, children: (kids || []).filter((k) => k.parent_id === p.id) }));
}

export default function AdminParents() {
  const { data, loading, error, reload } = useAsync(load, []);
  const [q, setQ] = useState("");
  const rows = useMemo(() => (data || []).filter((p) => `${p.full_name} ${p.email}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  return (
    <div className="page">
      <div className="page-head"><div><h1>Parents</h1><p>Parent accounts and their linked children. Link a parent from a student's detail page.</p></div></div>
      <Card>
        <div className="toolbar"><label className="sr-only" htmlFor="pq">Search parents</label>
          <input id="pq" className="search-wrap" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {loading ? <SkeletonTable /> : error ? <ErrorState message="Unable to load parents." onRetry={reload} />
          : !rows.length ? <EmptyState icon="users" title="No parents found" />
          : <div className="table-wrap"><table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Children</th><th>Status</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}><td>{p.full_name}</td><td>{p.email}</td><td>{p.phone || "—"}</td>
                <td>{p.children.length ? p.children.map((c) => `${c.profiles?.full_name} (${c.classes?.name}-${c.classes?.section})`).join(", ") : "—"}</td>
                <td><Badge tone={p.status === "active" ? "success" : "danger"}>{p.status === "active" ? "Active" : "Suspended"}</Badge></td></tr>
            ))}</tbody></table></div>}
      </Card>
    </div>
  );
}
