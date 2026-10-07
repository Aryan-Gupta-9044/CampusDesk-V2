// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- in-memory stand-in for the Supabase client (the real database rules are covered by tests/sql) ----
const fake = vi.hoisted(() => {
  const st = { session: null, listeners: new Set(), accounts: {}, users: {}, signUpArgs: null };
  const fire = (event) => st.listeners.forEach((cb) => cb(event, st.session));
  st.fire = fire;
  st.client = {
    auth: {
      getSession: async () => ({ data: { session: st.session } }),
      onAuthStateChange: (cb) => { st.listeners.add(cb); return { data: { subscription: { unsubscribe: () => st.listeners.delete(cb) } } }; },
      signInWithPassword: async ({ email, password }) => {
        const u = st.users[email];
        if (!u || u.password !== password) return { data: null, error: { message: "Invalid login credentials" } };
        st.session = { user: { id: u.id, email } }; fire("SIGNED_IN");
        return { data: { user: st.session.user, session: st.session }, error: null };
      },
      signOut: async () => { st.session = null; fire("SIGNED_OUT"); return { error: null }; },
      signUp: async (args) => { st.signUpArgs = args; return { data: { user: { id: "new", identities: [{}] }, session: null }, error: null }; },
    },
    rpc: async (name) => (name === "my_account_state" ? { data: st.accounts[st.session?.user.id] ?? { exists: false }, error: null } : { data: null, error: { code: "PGRST202" } }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: st.session ? { id: st.session.user.id } : null, error: null }) }) }) }),
  };
  return st;
});
vi.mock("../../src/lib/supabaseClient", () => ({ supabase: fake.client }));

import ProtectedRoute from "../../src/components/ProtectedRoute";
import StatusRoute from "../../src/components/account/StatusRoute";
import { AuthProvider, useAuth } from "../../src/context/AuthContext";
import { ThemeProvider } from "../../src/context/ThemeContext";
import { AccountSetupRequired, AccountSuspended, PendingApproval, RegistrationRejected, Unauthorized } from "../../src/pages/auth/AccountStatusPages";
import Login from "../../src/pages/auth/Login";
import Signup from "../../src/pages/auth/Signup";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const roots = [];
let auth;
const Spy = () => { auth = useAuth(); return null; };
const Where = () => <span data-testid="path">{useLocation().pathname}</span>;
const text = () => document.body.textContent;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

function App({ start }) {
  return (
    <ThemeProvider><AuthProvider><Spy /><MemoryRouter initialEntries={[start]}>
      <Where />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Signup />} />
        <Route path="/pending-approval" element={<StatusRoute state="pending"><PendingApproval /></StatusRoute>} />
        <Route path="/registration-rejected" element={<StatusRoute state="rejected"><RegistrationRejected /></StatusRoute>} />
        <Route path="/account-suspended" element={<StatusRoute state="suspended"><AccountSuspended /></StatusRoute>} />
        <Route path="/account-setup-required" element={<StatusRoute state="incomplete"><AccountSetupRequired /></StatusRoute>} />
        <Route path="/unauthorized" element={<ProtectedRoute><Unauthorized /></ProtectedRoute>} />
        <Route path="/" element={<ProtectedRoute><p>DASHBOARD</p></ProtectedRoute>} />
        <Route path="/student-area" element={<ProtectedRoute allowedRoles={["student"]}><p>STUDENT AREA</p></ProtectedRoute>} />
        <Route path="/teacher-area" element={<ProtectedRoute allowedRoles={["teacher"]}><p>TEACHER AREA</p></ProtectedRoute>} />
        <Route path="/parent-area" element={<ProtectedRoute allowedRoles={["parent"]}><p>PARENT AREA</p></ProtectedRoute>} />
        <Route path="/admin-area" element={<ProtectedRoute allowedRoles={["admin"]}><p>ADMIN AREA</p></ProtectedRoute>} />
      </Routes>
    </MemoryRouter></AuthProvider></ThemeProvider>
  );
}
async function open(start, signedInAs) {
  if (signedInAs) fake.session = { user: { id: fake.users[signedInAs].id, email: signedInAs } };
  const el = document.createElement("div"); document.body.appendChild(el);
  const root = createRoot(el); roots.push(root);
  await act(async () => root.render(<App start={start} />));
  await flush();
}
const setValue = (el, v) => { const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); };
const field = (label) => [...document.querySelectorAll("label")].find((l) => l.textContent.startsWith(label)).querySelector("input,select");
const path = () => document.querySelector('[data-testid="path"]').textContent;

const mkAccount = (status, role = "student", extra = {}) => ({ exists: true, status, role, entity_ok: true, requested_role: "student", full_name: "Test", email: "t@example.org", ...extra });

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); fake.session = null; fake.signUpArgs = null;
  const people = { "admin@x.org": ["a1", "admin"], "teacher@x.org": ["t1", "teacher"], "student@x.org": ["s1", "student"], "parent@x.org": ["p1", "parent"] };
  fake.users = {}; fake.accounts = {};
  for (const [email, [id, role]] of Object.entries(people)) { fake.users[email] = { id, password: "pw123456" }; fake.accounts[id] = mkAccount("active", role); }
  fake.users["pending@x.org"] = { id: "n1", password: "pw123456" }; fake.accounts.n1 = mkAccount("pending", "student", { requested_role: "teacher" });
  fake.users["susp@x.org"] = { id: "x1", password: "pw123456" };    fake.accounts.x1 = mkAccount("suspended");
  fake.users["rej@x.org"] = { id: "r1", password: "pw123456" };     fake.accounts.r1 = mkAccount("rejected", "student", { rejection_reason: "Not enrolled here." });
  fake.users["inc@x.org"] = { id: "i1", password: "pw123456" };     fake.accounts.i1 = mkAccount("incomplete", "teacher");
  fake.users["noprof@x.org"] = { id: "z1", password: "pw123456" };  // auth user, no profile
});
afterEach(() => { while (roots.length) act(() => roots.pop().unmount()); document.body.innerHTML = ""; });

describe("route protection with the real guards", () => {
  it("TEST 3/4: a pending user opening a dashboard or an admin page lands on Pending Approval, not Unauthorized", async () => {
    for (const start of ["/", "/admin-area", "/student-area"]) {
      await open(start, "pending@x.org");
      expect(path()).toBe("/pending-approval"); expect(text()).toContain("waiting for administrator approval"); expect(text()).not.toContain("DASHBOARD");
      expect(text()).not.toContain("don't have access"); expect(text()).toContain("Teacher");          // requested role is shown
      while (roots.length) act(() => roots.pop().unmount()); document.body.innerHTML = "";
    }
  });
  it("TEST 5: suspended -> account suspended page", async () => { await open("/", "susp@x.org"); expect(path()).toBe("/account-suspended"); expect(text()).toContain("Your account is suspended"); });
  it("TEST 6: rejected -> rejected page with the admin's reason; cannot enter the app", async () => {
    await open("/student-area", "rej@x.org");
    expect(path()).toBe("/registration-rejected"); expect(text()).toContain("was not approved"); expect(text()).toContain("Not enrolled here."); expect(text()).not.toContain("STUDENT AREA");
  });
  it("TEST 7: incomplete -> account setup required", async () => { await open("/", "inc@x.org"); expect(path()).toBe("/account-setup-required"); expect(text()).toContain("setup is not finished"); });
  it("TEST 8-11: each active role opens its own area", async () => {
    for (const [who, area, marker] of [["student@x.org", "/student-area", "STUDENT AREA"], ["teacher@x.org", "/teacher-area", "TEACHER AREA"], ["parent@x.org", "/parent-area", "PARENT AREA"], ["admin@x.org", "/admin-area", "ADMIN AREA"]]) {
      await open(area, who); expect(text()).toContain(marker);
      while (roots.length) act(() => roots.pop().unmount()); document.body.innerHTML = "";
    }
  });
  it("TEST 12-14/17: active student, teacher and parent opening an admin route get the proper Unauthorized page", async () => {
    for (const who of ["student@x.org", "teacher@x.org", "parent@x.org"]) {
      await open("/admin-area", who); expect(path()).toBe("/unauthorized"); expect(text()).toContain("You don't have access"); expect(text()).not.toContain("ADMIN AREA");
      while (roots.length) act(() => roots.pop().unmount()); document.body.innerHTML = "";
    }
  });
  it("TEST 1-4: existing active accounts keep working (state active, correct role)", async () => {
    for (const [who, role] of [["admin@x.org", "admin"], ["teacher@x.org", "teacher"], ["student@x.org", "student"], ["parent@x.org", "parent"]]) {
      await open("/", who); expect(text()).toContain("DASHBOARD"); expect(auth.state).toBe("active"); expect(auth.role).toBe(role);
      while (roots.length) act(() => roots.pop().unmount()); document.body.innerHTML = "";
    }
  });
  it("an active user opening /pending-approval is sent to the dashboard", async () => { await open("/pending-approval", "student@x.org"); expect(path()).toBe("/"); });
  it("logged-out visitor is sent to login", async () => { await open("/admin-area"); expect(path()).toBe("/login"); });
  it("the role is only available while the account is active", async () => { await open("/", "pending@x.org"); expect(auth.role).toBeNull(); expect(auth.state).toBe("pending"); });
});

describe("login", () => {
  const login = async (email, password = "pw123456") => {
    setValue(field("Email"), email); setValue(field("Password"), password);
    await act(async () => { document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();
  };
  it("wrong password -> 'Invalid email or password.'", async () => { await open("/login"); await login("student@x.org", "nope"); expect(text()).toContain("Invalid email or password."); expect(path()).toBe("/login"); });
  it("active login goes to the dashboard; pending/suspended/rejected/incomplete go to their page", async () => {
    for (const [email, to] of [["student@x.org", "/"], ["pending@x.org", "/pending-approval"], ["susp@x.org", "/account-suspended"], ["rej@x.org", "/registration-rejected"], ["inc@x.org", "/account-setup-required"]]) {
      await open("/login"); await login(email); expect(path()).toBe(to);
      while (roots.length) act(() => roots.pop().unmount()); document.body.innerHTML = ""; fake.session = null;
    }
  });
  it("auth works but no profile -> clear message, signed out, NOT unauthorized", async () => {
    await open("/login"); await login("noprof@x.org");
    expect(text()).toContain("profile has not been provisioned yet"); expect(path()).toBe("/login"); expect(fake.session).toBeNull();
  });
  it("TEST 20: logout then login preserves the account state", async () => {
    await open("/login"); await login("pending@x.org"); expect(auth.state).toBe("pending");
    await act(async () => { await auth.signOut(); }); await flush();
    expect(auth.state).toBe("unauthenticated"); expect(auth.role).toBeNull();
    await act(async () => { await auth.signIn({ email: "pending@x.org", password: "pw123456" }); }); await flush();
    expect(auth.state).toBe("pending");
  });
});

describe("registration", () => {
  const fill = async (requested) => {
    setValue(field("Full name"), "Rahul Sharma"); setValue(field("Email"), "rahul@example.org"); setValue(field("Phone"), "+91 99999 11111");
    if (requested) setValue(field("I'm registering as"), requested);
    setValue(field("Password"), "longenough1"); setValue(field("Confirm password"), "longenough1");
    await act(async () => { document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush();
  };
  it("the form can only REQUEST student, parent or teacher - admin is not offered", async () => {
    await open("/register");
    expect([...field("I'm registering as").options].map((o) => o.value).sort()).toEqual(["parent", "student", "teacher"]);
    expect(text()).toContain("reviewed by an administrator");
  });
  it("TEST 2/5/17: registering sends a requested_role but never a role, and ends on the Pending Approval page", async () => {
    await open("/register"); await fill("teacher");
    const data = fake.signUpArgs.options.data;
    expect(data).toMatchObject({ full_name: "Rahul Sharma", requested_role: "teacher" });
    expect(Object.keys(data)).not.toContain("role"); expect(Object.keys(data)).not.toContain("status");
    expect(path()).toBe("/pending-approval"); expect(text()).toContain("rahul@example.org"); expect(text()).toContain("Teacher");
    expect(text()).toContain("Confirm your email") || expect(text()).toContain("confirmation link");
  });
  it("a tampered requested role (admin) is not sent", async () => {
    await open("/register"); setValue(field("I'm registering as"), "teacher");
    await act(async () => { await auth.signUp({ email: "evil@example.org", password: "longenough1", fullName: "Evil", requestedRole: "admin" }); });
    expect(fake.signUpArgs.options.data.requested_role).toBeNull(); expect(Object.keys(fake.signUpArgs.options.data)).not.toContain("role");
  });
  it("rejects mismatched passwords without calling the server", async () => {
    await open("/register"); setValue(field("Full name"), "A B"); setValue(field("Email"), "a@b.co"); setValue(field("Password"), "longenough1"); setValue(field("Confirm password"), "different11");
    await act(async () => { document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(text()).toContain("Passwords don't match."); expect(fake.signUpArgs).toBeNull();
  });
});
