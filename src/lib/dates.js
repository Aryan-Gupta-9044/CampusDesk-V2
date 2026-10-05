// All date/time logic uses India Standard Time so "today", "current class"
// and "starts in X minutes" are consistent for every user.
export const TZ = "Asia/Kolkata";
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
});
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Current (or given) moment expressed in IST. */
export function istNow(date = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  const minute = Number(p.minute);
  return { dateStr: `${p.year}-${p.month}-${p.day}`, dow: DOW[p.weekday], hour, minute, minutes: hour * 60 + minute };
}

export const todayISO = () => istNow().dateStr;

export function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = String(t).split(":");
  return Number(h) * 60 + Number(m);
}

/** "08:00:00" -> "08:00 AM" */
export function formatTime(t) {
  const mins = timeToMinutes(t);
  if (mins == null || Number.isNaN(mins)) return "";
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ap}`;
}

/** "08:00:00" -> "08:00" */
export function formatTime24(t) {
  const mins = timeToMinutes(t);
  if (mins == null || Number.isNaN(mins)) return "";
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function toDate(d) {
  if (!d) return null;
  if (typeof d === "string" && d.length === 10) return new Date(`${d}T00:00:00+05:30`);
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** -> "04 Oct 2026" */
export function formatDate(d) {
  const dt = toDate(d);
  if (!dt) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" }).format(dt);
}

/** -> "04 Oct 2026, 10:30 AM" */
export function formatDateTime(d) {
  const dt = toDate(d);
  if (!dt) return "";
  const time = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true }).format(dt);
  return `${formatDate(dt)}, ${time}`;
}

export function timeAgo(iso) {
  const dt = toDate(iso);
  if (!dt) return "";
  const diff = Math.max(0, Date.now() - dt.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(dt);
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Whole days from today (IST) until dateStr; negative if in the past. */
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const [y1, m1, d1] = todayISO().split("-").map(Number);
  const [y2, m2, d2] = String(dateStr).slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Monday of the week containing dateStr (YYYY-MM-DD). */
export function weekStart(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(dateStr, -((dow + 6) % 7));
}

export function greeting() {
  const h = istNow().hour;
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function relativeDays(n) {
  if (n == null) return "";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `In ${n} days` : `${Math.abs(n)} days ago`;
}
