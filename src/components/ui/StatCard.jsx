import React from "react";
import Icon from "./Icon";
import Badge from "./Badge";

// Compact informational KPI - NOT a navigation card.
export default function StatCard({ label, value, hint, tone, status, icon }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className={`stat-icon tone-${tone || "muted"}`}><Icon name={icon} size={16} /></span>}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        {status && <Badge tone={status.tone}>{status.label}</Badge>}
        {hint && <span className="stat-hint">{hint}</span>}
      </div>
    </div>
  );
}
