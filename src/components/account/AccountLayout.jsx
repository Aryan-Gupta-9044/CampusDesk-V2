import React from "react";
import ThemeToggle from "../layout/ThemeToggle";
import Icon from "../ui/Icon";

/** Shared look for every account-status page (pending, rejected, suspended, setup required, unauthorized). */
export default function AccountLayout({ icon = "user", tone = "info", eyebrow, title, children, details = [], actions }) {
  return (
    <div className="auth-page">
      <div className="auth-theme"><ThemeToggle /></div>
      <section className="card status-card" aria-labelledby="status-title">
        <span className={`status-icon tone-${tone}`}><Icon name={icon} size={26} /></span>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 id="status-title">{title}</h1>
        <div className="status-body">{children}</div>
        {details.length > 0 && (
          <dl className="status-details">
            {details.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        )}
        {actions && <div className="status-actions">{actions}</div>}
      </section>
    </div>
  );
}
