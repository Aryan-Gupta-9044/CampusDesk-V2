import React from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useAsync } from "../../hooks/useAsync";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../../lib/services/notifications";
import { NOTIFICATION_ICON } from "../../config/navigation";
import { timeAgo } from "../../lib/dates";
import Card from "../../components/ui/Card";
import Icon from "../../components/ui/Icon";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";

export default function NotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(() => listNotifications(100), []);
  const unread = (data || []).filter((n) => !n.is_read).length;

  const open = async (n) => {
    try { if (!n.is_read) await markNotificationRead(n.id); } catch { toast("Could not update notification.", "error"); }
    if (n.link) navigate(n.link); else reload();
  };
  const readAll = async () => {
    try { await markAllNotificationsRead(user.id); toast("All notifications marked as read."); reload(); }
    catch { toast("Could not update notifications.", "error"); }
  };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Notifications</h1><p>{unread} unread</p></div>
        <button type="button" className="btn btn-outline btn-sm" onClick={readAll} disabled={!unread}>Mark all as read</button></div>
      <Card>
        {loading ? <SkeletonTable /> : error ? <ErrorState message="Unable to load notifications." onRetry={reload} />
          : !data.length ? <EmptyState icon="bell" title="You're all caught up" hint="No notifications yet." />
          : <div style={{ margin: "-16px -18px" }}>{data.map((n) => (
            <button key={n.id} type="button" className={`notif-item ${n.is_read ? "" : "unread"}`} onClick={() => open(n)}>
              <span className="notif-ico"><Icon name={NOTIFICATION_ICON[n.type] || "bell"} size={15} /></span>
              <span style={{ flex: 1 }}><span className="notif-title">{n.title}</span>
                {n.body && <span className="notif-body" style={{ display: "block" }}>{n.body}</span>}
                <span className="notif-time" style={{ display: "block" }}>{timeAgo(n.created_at)}{n.is_read ? "" : " · Unread"}</span></span>
              {!n.is_read && <span className="unread-dot" aria-label="Unread" />}
            </button>))}</div>}
      </Card>
    </div>
  );
}
