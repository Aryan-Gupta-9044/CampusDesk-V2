import React from "react";

// Status is always shown as text (never colour alone).
export default function Badge({ tone = "muted", children, icon }) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
