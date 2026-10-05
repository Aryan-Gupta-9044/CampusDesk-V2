export function inr(n) {
  const v = Number(n);
  if (n == null || Number.isNaN(v)) return "₹0";
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v)}`;
}

/** Never renders NaN / null / undefined. */
export function pctText(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Math.round(Number(n))}%`;
}

export function initials(name) {
  return (name || "?")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";
}

export function safe(v, fallback = "—") {
  return v == null || v === "" || (typeof v === "number" && Number.isNaN(v)) ? fallback : v;
}

export const ROLE_LABEL = { admin: "Administrator", teacher: "Teacher", student: "Student", parent: "Parent" };
