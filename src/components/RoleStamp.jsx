import React from "react";

const ACCENT_BY_ROLE = {
  admin: "accent-coral",
  teacher: "accent-blue",
  student: "accent-green",
  parent: "accent-yellow",
};

function RoleStamp({ role, size = "md" }) {
  const accent = ACCENT_BY_ROLE[role] || "accent-coral";
  return (
    <span className={`role-stamp ${accent} role-stamp-${size}`}>
      {role}
    </span>
  );
}

export default RoleStamp;
