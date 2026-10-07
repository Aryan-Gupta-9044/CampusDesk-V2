import React, { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useChild } from "../../context/ChildContext";
import { useAsync } from "../../hooks/useAsync";
import { supabase } from "../../lib/supabaseClient";
import { updateMyProfile } from "../../lib/queries/account";
import { uploadAvatar } from "../../lib/storage";
import { ROLE_LABEL, avatarClass, initials, safe } from "../../lib/format";
import { formatDate } from "../../lib/dates";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";

async function loadRoleDetails(role, id) {
  if (role === "student") {
    const { data, error } = await supabase.from("students").select("roll_no, dob, gender, classes ( name, section )").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }
  if (role === "teacher") {
    const { data, error } = await supabase.from("teachers").select("employee_id, department, qualification, joining_date").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }
  return null;
}

function Row({ label, value }) {
  return <div className="detail-item"><div className="eyebrow">{label}</div><div>{safe(value)}</div></div>;
}

export default function Profile() {
  const { user, profile, role, refreshProfile } = useAuth();
  const { children: kids } = useChild();
  const { toast } = useToast();
  const { data: details, loading } = useAsync(() => loadRoleDetails(role, user.id), [role, user.id]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: profile.full_name || "", phone: profile.phone || "" });
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await updateMyProfile(user.id, form); await refreshProfile(); setEditing(false); toast("Profile updated."); }
    catch (err) { if (import.meta.env.DEV) console.error(err); toast("Unable to update your profile.", "error"); }
    finally { setSaving(false); }
  };

  const onAvatar = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast("Please choose an image under 2 MB.", "error"); return; }
    try { await uploadAvatar(user.id, file); await refreshProfile(); toast("Photo updated."); }
    catch (err) { if (import.meta.env.DEV) console.error(err); toast("Unable to upload the photo.", "error"); }
  };

  if (loading) return <SkeletonCard height={220} />;
  const cls = details?.classes ? `${details.classes.name}-${details.classes.section}` : null;

  return (
    <div className="page">
      <div className="page-head"><div><h1>My profile</h1><p>Your account details</p></div>
        <Link className="btn btn-outline btn-sm" to="/settings">Settings &amp; password</Link></div>
      <Card>
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <span className={`avatar avatar-lg ${avatarClass(profile.full_name)}`}>{profile.avatar_url ? <img src={profile.avatar_url} alt={`${profile.full_name} profile`} /> : initials(profile.full_name)}</span>
          <div>
            <h2>{profile.full_name}</h2>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <Badge tone="primary">{ROLE_LABEL[role]}</Badge>
              <Badge tone={profile.status === "active" ? "success" : "danger"}>{profile.status === "active" ? "Active" : "Suspended"}</Badge>
            </div>
            <label className="text-link" style={{ display: "inline-block", marginTop: 8, cursor: "pointer" }}>
              Change photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={onAvatar} className="sr-only" />
            </label>
          </div>
        </div>
        {editing ? (
          <form className="student-form" onSubmit={save}>
            <div className="form-grid">
              <label>Full name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
              <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
              <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <div className="detail-grid">
              <Row label="Full name" value={profile.full_name} />
              <Row label="Email" value={profile.email || user.email} />
              <Row label="Phone" value={profile.phone} />
              <Row label="Role" value={ROLE_LABEL[role]} />
              {role === "student" && <><Row label="Class" value={cls} /><Row label="Roll number" value={details?.roll_no} />
                <Row label="Date of birth" value={details?.dob ? formatDate(details.dob) : null} /></>}
              {role === "teacher" && <><Row label="Department" value={details?.department} /><Row label="Employee ID" value={details?.employee_id} />
                <Row label="Qualification" value={details?.qualification} /></>}
              {role === "parent" && <Row label="Children" value={kids.map((k) => `${k.profiles?.full_name} (${k.classes?.name}-${k.classes?.section})`).join(", ") || null} />}
            </div>
            <div className="form-actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>Edit name &amp; phone</button>
            </div>
          </>
        )}
        <p className="chart-note">Email, role and class are managed by your school administrator.</p>
      </Card>
    </div>
  );
}
