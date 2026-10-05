import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../../lib/services/notifications";
import { timeAgo } from "../../lib/dates";
import { NOTIFICATION_ICON } from "../../config/navigation";
import Icon from "../ui/Icon";
import { EmptyState, ErrorState } from "../ui/States";
import { useToast } from "../ui/Toast";

export default function NotificationCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      setItems(await listNotifications());
      setError(false);
    } catch (e) {
      if (import.meta.env.DEV) console.error("[CampusDesk] notifications:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, user?.id]);

  // Live updates: new notifications appear without a refresh (falls back to refresh on open).
  useEffect(() => {
    if (!user) return undefined;
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const unread = items.filter((n) => !n.is_read).length;

  const readOne = async (n) => {
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      try { await markNotificationRead(n.id); } catch { toast("Could not update notification.", "error"); load(); }
    }
    if (n.link) { setOpen(false); navigate(n.link); }
  };

  const readAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    try { await markAllNotificationsRead(user.id); toast("All notifications marked as read."); }
    catch { toast("Could not update notifications.", "error"); load(); }
  };

  return (
    <div className="nav-item" ref={ref}>
      <button
        type="button" className="icon-btn" aria-haspopup="true" aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
      >
        <Icon name="bell" size={19} />
        {unread > 0 && <span className="badge-dot" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="dropdown dropdown-right notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            <button type="button" className="text-link" onClick={readAll} disabled={unread === 0}>Mark all as read</button>
          </div>
          <div className="notif-list">
            {loading ? <div className="state"><p className="state-hint">Loading…</p></div>
              : error ? <ErrorState message="Unable to load notifications." onRetry={load} />
              : items.length === 0 ? <EmptyState icon="bell" title="You're all caught up" hint="No notifications yet." />
              : items.map((n) => (
                <button key={n.id} type="button" className={`notif-item ${n.is_read ? "" : "unread"}`} onClick={() => readOne(n)}>
                  <span className="notif-ico"><Icon name={NOTIFICATION_ICON[n.type] || "bell"} size={15} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="notif-title">{n.title}</span>
                    {n.body && <span className="notif-body" style={{ display: "block" }}>{n.body}</span>}
                    <span className="notif-time" style={{ display: "block" }}>{timeAgo(n.created_at)}{n.is_read ? "" : " · Unread"}</span>
                  </span>
                  {!n.is_read && <span className="unread-dot" aria-hidden="true" />}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
