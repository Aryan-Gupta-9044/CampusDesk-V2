import React from "react";
import { Link } from "react-router-dom";

export function Card({ title, subtitle, action, actionTo, actionLabel, children, className = "", bodyClass = "", as: Tag = "section", ...rest }) {
  return (
    <Tag className={`card ${className}`} {...rest}>
      {(title || action || actionTo) && (
        <header className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actionTo && (
            <Link className="card-link" to={actionTo}>{actionLabel || "View all"} <span aria-hidden="true">→</span></Link>
          )}
          {action}
        </header>
      )}
      <div className={`card-body ${bodyClass}`}>{children}</div>
    </Tag>
  );
}

export default Card;
