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

/** One of six soft avatar colours, stable per name (CSS classes av-0 ... av-5). */
export function avatarClass(name) {
  const str = String(name || "?");
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return `av-${h % 6}`;
}
