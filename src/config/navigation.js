// Single source of truth for navigation. Each entry: { label, to } or { label, items: [...] }.
// Routes listed here are also the ones the router guards per role (see App.jsx).
export const NAV = {
  student: [
    { label: "Dashboard", to: "/" },
    { label: "Academics", items: [
      { label: "Timetable", to: "/timetable" },
      { label: "Attendance", to: "/attendance" },
      { label: "Results", to: "/results" },
      { label: "Academic Report", to: "/report" },
    ] },
    { label: "Finance", items: [
      { label: "Fees", to: "/fees" },
      { label: "Payment History", to: "/payment-history" },
    ] },
    { label: "Communication", items: [
      { label: "Notices", to: "/notices" },
      { label: "Events", to: "/events" },
      { label: "Chat", to: "/chat" },
    ] },
    { label: "Leave", to: "/leave" },
    { label: "Documents", to: "/documents" },
  ],
  teacher: [
    { label: "Dashboard", to: "/" },
    { label: "Teaching", items: [
      { label: "My Classes", to: "/my-classes" },
      { label: "Attendance", to: "/attendance" },
      { label: "Marks", to: "/results" },
      { label: "Academic Reports", to: "/report" },
    ] },
    { label: "Schedule", items: [{ label: "My Timetable", to: "/timetable" }] },
    { label: "Communication", items: [
      { label: "Notices", to: "/notices" },
      { label: "Events", to: "/events" },
      { label: "Student Queries", to: "/chat" },
    ] },
    { label: "Leave", to: "/leave" },
    { label: "Documents", to: "/documents" },
  ],
  parent: [
    { label: "Dashboard", to: "/" },
    { label: "Child", items: [
      { label: "Attendance", to: "/attendance" },
      { label: "Results", to: "/results" },
      { label: "Academic Report", to: "/report" },
      { label: "Timetable", to: "/timetable" },
    ] },
    { label: "Finance", items: [
      { label: "Fees", to: "/fees" },
      { label: "Payment History", to: "/payment-history" },
    ] },
    { label: "Communication", items: [
      { label: "Notices", to: "/notices" },
      { label: "Events", to: "/events" },
      { label: "Chat", to: "/chat" },
    ] },
    { label: "Documents", to: "/documents" },
  ],
  admin: [
    { label: "Dashboard", to: "/" },
    { label: "People", items: [
      { label: "Students", to: "/students" },
      { label: "Teachers", to: "/teachers" },
      { label: "Parents", to: "/parents" },
    ] },
    { label: "Academics", items: [
      { label: "Classes & Subjects", to: "/classes" },
      { label: "Timetable", to: "/timetable" },
      { label: "Exams & Results", to: "/results" },
    ] },
    { label: "Finance", items: [
      { label: "Fees & Payments", to: "/fees" },
    ] },
    { label: "Communication", items: [
      { label: "Notices", to: "/notices" },
      { label: "Events", to: "/events" },
    ] },
    { label: "Operations", items: [
      { label: "Leave Requests", to: "/leave" },
      { label: "Audit Logs", to: "/audit-log" },
    ] },
    { label: "Documents", to: "/documents" },
  ],
};

export const PROFILE_MENU = [
  { label: "My Profile", to: "/profile" },
  { label: "Settings", to: "/settings" },
];

export const NOTIFICATION_ICON = {
  notice: "megaphone", result: "chart", fee: "wallet", timetable: "calendar",
  event: "calendar", leave: "file", query: "message", general: "bell",
};

/** Does `pathname` belong to nav entry `to`? */
export function isActivePath(pathname, to) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

// Icon per destination (used by the sidebar, especially when collapsed).
export const NAV_ICON = {
  "/": "home", "/timetable": "calendar", "/attendance": "check", "/results": "chart", "/report": "file",
  "/fees": "wallet", "/payment-history": "wallet", "/notices": "megaphone", "/events": "calendar", "/chat": "message",
  "/documents": "inbox", "/leave": "clock", "/my-classes": "users", "/students": "users", "/teachers": "user",
  "/parents": "users", "/classes": "book", "/audit-log": "settings",
};

/** Breadcrumb trail [{label, to?}] for a pathname, derived from the role's navigation. */
export function breadcrumbsFor(role, pathname) {
  const crumbs = [{ label: "Home", to: "/" }];
  if (pathname === "/") return [{ label: "Dashboard" }];
  const items = NAV[role] || [];
  let best = null;
  for (const item of items) {
    const list = item.items ? item.items.map((i) => ({ ...i, group: item.label })) : [{ ...item, group: null }];
    for (const i of list) {
      if (i.to !== "/" && isActivePath(pathname, i.to) && (!best || i.to.length > best.to.length)) best = i;
    }
  }
  if (best) {
    if (best.group) crumbs.push({ label: best.group });
    const rest = pathname.slice(best.to.length).split("/").filter(Boolean);
    crumbs.push({ label: best.label, to: rest.length ? best.to : undefined });
    if (rest.length) crumbs.push({ label: rest[rest.length - 1] === "new" ? "New" : rest[rest.length - 1] === "import" ? "Import" : rest[rest.length - 1] === "report" ? "Report" : "Details" });
  } else {
    const names = { "/profile": "My profile", "/settings": "Settings", "/notifications": "Notifications" };
    crumbs.push({ label: names[pathname] || "Page" });
  }
  return crumbs;
}
