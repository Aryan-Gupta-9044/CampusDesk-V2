import React from "react";
import Icon from "./Icon";

export function EmptyState({ icon = "inbox", title, hint, action }) {
  return (
    <div className="state state-empty">
      <span className="state-icon"><Icon name={icon} size={26} /></span>
      <p className="state-title">{title}</p>
      {hint && <p className="state-hint">{hint}</p>}
      {action}
    </div>
  );
}

// Users see a friendly sentence; the raw error is only logged in development (see useAsync).
export function ErrorState({ message = "Unable to load this section.", onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <span className="state-icon"><Icon name="alert" size={26} /></span>
      <p className="state-title">{message}</p>
      <p className="state-hint">Please try again.</p>
      {onRetry && (
        <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
          <Icon name="refresh" size={14} /> Retry
        </button>
      )}
    </div>
  );
}

export function PageLoading({ label = "Loading…" }) {
  return <div className="page-loading" role="status">{label}</div>;
}
