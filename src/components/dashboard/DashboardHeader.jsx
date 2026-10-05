import React from "react";
import { Link } from "react-router-dom";
import { DAY_NAMES, formatDate, greeting, istNow } from "../../lib/dates";

export default function DashboardHeader({ name, subtitle, actions = [] }) {
  const now = istNow();
  return (
    <div className="dash-head">
      <div>
        <h1>{greeting()}, {name || "there"} 👋</h1>
        {subtitle && <p>{subtitle}</p>}
        <p className="feed-meta">{DAY_NAMES[now.dow]}, {formatDate(now.dateStr)}</p>
      </div>
      {actions.length > 0 && (
        <div className="quick-actions" aria-label="Quick actions">
          {actions.map((a) => <Link key={a.to + a.label} to={a.to} className="btn btn-outline btn-sm">+ {a.label}</Link>)}
        </div>
      )}
    </div>
  );
}
