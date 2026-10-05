import React, { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { useChild } from "../../context/ChildContext";
import { useAsync } from "../../hooks/useAsync";
import { listActiveTeachersForDropdown, listClasses, listSubjects } from "../../lib/queries/classes";
import { addTimetableEntry, deleteTimetableEntry, listMyTimetable, listTimetableForClass } from "../../lib/queries/timetable";
import { getStudentProfile } from "../../lib/services/studentData";
import { DAY_NAMES, formatTime } from "../../lib/dates";
import TimetableGrid from "../../components/timetable/TimetableGrid";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";

function Header({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children}
    </div>
  );
}

function GridCard({ entries, loading, error, reload, mode, highlightSubjects }) {
  if (loading) return <SkeletonCard height={320} />;
  if (error) return <Card><ErrorState message="Unable to load the timetable." onRetry={reload} /></Card>;
  if (!entries?.length) return <Card><EmptyState icon="calendar" title="No timetable available" hint="The timetable has not been published yet." /></Card>;
  return <Card><TimetableGrid entries={entries} mode={mode} highlightSubjects={highlightSubjects} /></Card>;
}

function ClassTimetable({ classId, title, sub }) {
  const { data, loading, error, reload } = useAsync(() => listTimetableForClass(classId), [classId], { enabled: !!classId });
  return (<div className="page"><Header title={title} sub={sub} /><GridCard entries={data} loading={loading} error={error} reload={reload} mode="class" /></div>);
}

function StudentView() {
  const { user } = useAuth();
  const { data: me, loading, error } = useAsync(() => getStudentProfile(user.id), [user.id]);
  if (loading) return <SkeletonCard height={320} />;
  if (error) return <Card><ErrorState message="Unable to load your profile." /></Card>;
  if (!me?.class_id) return <Card><EmptyState icon="calendar" title="No class assigned" hint="Ask an administrator to assign you to a class." /></Card>;
  return <ClassTimetable classId={me.class_id} title="My timetable" sub={`Class ${me.classes.name}-${me.classes.section} · weekly schedule`} />;
}

function ParentView() {
  const { child, loading } = useChild();
  if (loading) return <SkeletonCard height={320} />;
  if (!child?.class_id) return <Card><EmptyState icon="calendar" title="No child linked" hint="Ask the school office to link your child's record." /></Card>;
  return <ClassTimetable key={child.id} classId={child.class_id} title="Child's timetable" sub={`${child.profiles?.full_name} · Class ${child.classes?.name}-${child.classes?.section}`} />;
}

function TeacherView() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => listMyTimetable(user.id), [user.id]);
  return (
    <div className="page">
      <Header title="My timetable" sub="Your weekly teaching schedule" />
      <GridCard entries={data} loading={loading} error={error} reload={reload} mode="teacher" />
    </div>
  );
}

const emptyForm = { subjectId: "", teacherId: "", dayOfWeek: "1", startTime: "", endTime: "", room: "" };

function AdminView() {
  const { toast } = useToast();
  const [classId, setClassId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const classes = useAsync(listClasses, []);
  const teachers = useAsync(listActiveTeachersForDropdown, []);
  const subjects = useAsync(() => listSubjects(classId), [classId], { enabled: !!classId });
  const tt = useAsync(() => listTimetableForClass(classId), [classId], { enabled: !!classId });

  useEffect(() => { if (!classId && classes.data?.length) setClassId(classes.data[0].id); }, [classes.data, classId]);
  const sorted = useMemo(() => [...(tt.data || [])].sort((a, b) => a.day_of_week - b.day_of_week || String(a.start_time).localeCompare(String(b.start_time))), [tt.data]);
  const set = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const add = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addTimetableEntry({ classId, ...form });
      setForm(emptyForm); toast("Period added."); tt.reload();
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      toast(err?.code === "23505" ? "That class already has a period at this time." : "Unable to add the period. Check the times and try again.", "error");
    } finally { setSaving(false); }
  };
  const remove = async () => {
    try { await deleteTimetableEntry(toDelete.id); toast("Period removed."); tt.reload(); }
    catch (err) { if (import.meta.env.DEV) console.error(err); toast("Unable to remove the period.", "error"); }
    setToDelete(null);
  };

  return (
    <div className="page">
      <Header title="Timetable" sub="Select a class to view or edit its weekly schedule">
        <div>
          <label className="sr-only" htmlFor="tt-class">Class</label>
          <select id="tt-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {(classes.data || []).map((c) => <option key={c.id} value={c.id}>Class {c.name}-{c.section}</option>)}
          </select>
        </div>
      </Header>
      <div className="stack">
        <GridCard entries={tt.data} loading={tt.loading} error={tt.error} reload={tt.reload} mode="class" />
        {classId && (
          <Card title="Add a period">
            <form onSubmit={add} className="student-form">
              <div className="form-grid">
                <label>Subject<select name="subjectId" value={form.subjectId} onChange={set} required>
                  <option value="">Select subject</option>{(subjects.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label>Teacher<select name="teacherId" value={form.teacherId} onChange={set}>
                  <option value="">Unassigned</option>{(teachers.data || []).map((t) => <option key={t.id} value={t.id}>{t.profiles?.full_name}</option>)}</select></label>
                <label>Day<select name="dayOfWeek" value={form.dayOfWeek} onChange={set}>
                  {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
                <label>Start<input type="time" name="startTime" value={form.startTime} onChange={set} required /></label>
                <label>End<input type="time" name="endTime" value={form.endTime} onChange={set} required /></label>
                <label>Room<input name="room" value={form.room} onChange={set} placeholder="e.g. Lab 1" /></label>
              </div>
              <div className="form-actions"><button className="btn btn-primary" disabled={saving}>{saving ? "Adding…" : "Add period"}</button></div>
            </form>
          </Card>
        )}
        {sorted.length > 0 && (
          <Card title="All periods" subtitle="Remove a period if it was added by mistake">
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Teacher</th><th>Room</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{sorted.map((e) => (
                <tr key={e.id}><td>{DAY_NAMES[e.day_of_week]}</td><td>{formatTime(e.start_time)} – {formatTime(e.end_time)}</td>
                  <td>{e.subjects?.name}</td><td>{e.teachers?.profiles?.full_name || "—"}</td><td>{e.room || "—"}</td>
                  <td><button type="button" className="btn btn-danger btn-sm" onClick={() => setToDelete(e)}>Remove</button></td></tr>
              ))}</tbody>
            </table></div>
          </Card>
        )}
      </div>
      <ConfirmDialog open={!!toDelete} title="Remove this period?" confirmLabel="Remove"
        message={toDelete ? `${toDelete.subjects?.name} on ${DAY_NAMES[toDelete.day_of_week]} at ${formatTime(toDelete.start_time)} will be removed. Students and the teacher will be notified.` : ""}
        onConfirm={remove} onCancel={() => setToDelete(null)} />
    </div>
  );
}

export default function Timetable() {
  const { role } = useAuth();
  if (role === "admin") return <AdminView />;
  if (role === "teacher") return <TeacherView />;
  if (role === "student") return <StudentView />;
  if (role === "parent") return <ParentView />;
  return null;
}
