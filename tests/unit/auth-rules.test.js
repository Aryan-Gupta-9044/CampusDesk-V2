import { describe, expect, it } from "vitest";
import { STATE_ROUTE, deriveAccount, landingFor, resolveAccess, resolveStatusPage } from "../../src/auth/accessRules";

const raw = (o = {}) => ({ exists: true, status: "active", role: "student", entity_ok: true, ...o });

describe("deriveAccount: database answer -> account state", () => {
  it("TEST 19: an existing V1-style active account (no new columns) keeps its role", () => {
    for (const role of ["admin", "teacher", "student", "parent"]) {
      const a = deriveAccount({ exists: true, status: "active", role, full_name: "X", email: "x@y" });
      expect(a).toMatchObject({ state: "active", role });
    }
  });
  it("pending / suspended / rejected / incomplete never expose a role", () => {
    for (const status of ["pending", "suspended", "rejected", "incomplete"]) {
      const a = deriveAccount(raw({ status, role: "admin" }));      // even if the placeholder role says admin
      expect(a.state).toBe(status); expect(a.role).toBeNull();
    }
  });
  it("active student/teacher without their record is 'incomplete'", () => expect(deriveAccount(raw({ entity_ok: false })).state).toBe("incomplete"));
  it("unknown status or invalid role -> account-setup-required, never a role", () => {
    expect(deriveAccount(raw({ status: "banana" }))).toMatchObject({ state: "incomplete", role: null });
    expect(deriveAccount(raw({ role: "superuser" }))).toMatchObject({ state: "incomplete", role: null });
  });
  it("auth user without a CampusDesk profile -> no_profile", () => {
    expect(deriveAccount({ exists: false }).state).toBe("no_profile");
    expect(deriveAccount(null).state).toBe("no_profile");
  });
  it("an applicant can request student/parent/teacher but never admin", () => {
    expect(deriveAccount(raw({ status: "pending", requested_role: "teacher" })).requestedRole).toBe("teacher");
    expect(deriveAccount(raw({ status: "pending", requested_role: "admin" })).requestedRole).toBeNull();
  });
});

describe("resolveAccess: protected routes", () => {
  const go = (state, role, allowed) => resolveAccess({ state, role }, allowed);
  it("shows loading while the session/account is still loading (no redirect flicker)", () => expect(go("loading", null, ["admin"])).toEqual({ type: "loading" }));
  it("TEST: unauthenticated -> login", () => expect(go("unauthenticated", null)).toEqual({ type: "redirect", to: "/login" }));
  it("TEST 3/4: pending user can never reach a dashboard; goes to /pending-approval (NOT /unauthorized)", () => {
    for (const allowed of [undefined, ["student"], ["admin"]]) expect(go("pending", null, allowed)).toEqual({ type: "redirect", to: "/pending-approval" });
  });
  it("TEST 5: suspended -> /account-suspended", () => expect(go("suspended", null)).toEqual({ type: "redirect", to: "/account-suspended" }));
  it("TEST 6: rejected -> /registration-rejected (cannot enter the app)", () => expect(go("rejected", null, ["student"])).toEqual({ type: "redirect", to: "/registration-rejected" }));
  it("TEST 7: incomplete -> /account-setup-required", () => expect(go("incomplete", null)).toEqual({ type: "redirect", to: "/account-setup-required" }));
  it("TEST 8-11: active users reach their own areas", () => {
    expect(go("active", "student", ["student", "parent"]).type).toBe("allow");
    expect(go("active", "teacher", ["teacher"]).type).toBe("allow");
    expect(go("active", "parent", ["parent"]).type).toBe("allow");
    expect(go("active", "admin", ["admin"]).type).toBe("allow");
  });
  it("TEST 12-14: student / teacher / parent cannot open admin routes -> /unauthorized", () => {
    for (const role of ["student", "teacher", "parent"]) expect(go("active", role, ["admin"])).toEqual({ type: "redirect", to: "/unauthorized" });
  });
  it("/unauthorized is ONLY for active accounts in the wrong area", () => {
    const nonActive = ["pending", "suspended", "rejected", "incomplete", "unauthenticated"];
    for (const st of nonActive) expect(go(st, null, ["admin"])).not.toEqual({ type: "redirect", to: "/unauthorized" });
  });
  it("network failure and missing profile get their own screens", () => {
    expect(go("error", null).type).toBe("error"); expect(go("no_profile", null).type).toBe("no_profile");
  });
  it("landing after login follows the state", () => {
    expect(landingFor("active")).toBe("/");
    for (const [st, to] of Object.entries(STATE_ROUTE)) expect(landingFor(st)).toBe(to);
  });
});

describe("resolveStatusPage: /pending-approval etc.", () => {
  it("only people in that state may see the page", () => {
    expect(resolveStatusPage({ state: "pending" }, "pending")).toEqual({ type: "allow" });
    expect(resolveStatusPage({ state: "active" }, "pending")).toEqual({ type: "redirect", to: "/" });
    expect(resolveStatusPage({ state: "suspended" }, "pending")).toEqual({ type: "redirect", to: "/account-suspended" });
    expect(resolveStatusPage({ state: "unauthenticated" }, "suspended")).toEqual({ type: "redirect", to: "/login" });
  });
  it("a just-registered visitor (email confirmation pending, no session yet) can see the pending page", () => {
    expect(resolveStatusPage({ state: "unauthenticated" }, "pending", { justRegistered: true })).toEqual({ type: "allow" });
  });
});
