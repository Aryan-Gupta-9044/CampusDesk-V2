// Pure rules for "who may see what". No React, no network: easy to unit test.
//
// Authentication  = Supabase says who you are (a session exists).
// Authorization   = your CampusDesk account is `active` AND your role may open the route.
// A session alone never unlocks the application.

export const ACCOUNT_STATUSES = ["pending", "active", "suspended", "rejected", "incomplete"];
export const ASSIGNABLE_ROLES = ["student", "parent", "teacher"];          // what an admin can assign to an applicant
export const REQUESTABLE_ROLES = ["student", "parent", "teacher"];         // what a public applicant may *ask* for
export const VALID_ROLES = ["admin", "teacher", "student", "parent"];

/** Where each non-active state lives. */
export const STATE_ROUTE = {
  pending: "/pending-approval",
  rejected: "/registration-rejected",
  suspended: "/account-suspended",
  incomplete: "/account-setup-required",
};

/**
 * Turns the database answer (my_account_state()) into the account the UI works with.
 * Anything unexpected becomes `incomplete` (=> "Account setup required"), never an accidental role.
 */
export function deriveAccount(raw) {
  if (!raw || raw.exists === false) return { state: "no_profile", role: null };
  const base = {
    requestedRole: REQUESTABLE_ROLES.includes(raw.requested_role) ? raw.requested_role : null,
    fullName: raw.full_name || "", email: raw.email || "",
    rejectionReason: raw.rejection_reason || "", statusReason: raw.status_reason || "",
  };
  if (!ACCOUNT_STATUSES.includes(raw.status)) return { ...base, state: "incomplete", role: null };
  if (raw.status !== "active") return { ...base, state: raw.status, role: null };      // role of a non-active account is ignored
  if (!VALID_ROLES.includes(raw.role)) return { ...base, state: "incomplete", role: null };
  if (raw.entity_ok === false) return { ...base, state: "incomplete", role: null };    // active student/teacher without their record
  return { ...base, state: "active", role: raw.role };
}

/**
 * Decision for a protected route.
 * `auth` = { state, role } where state is one of: loading | unauthenticated | error | no_profile | pending |
 *          rejected | suspended | incomplete | active
 */
export function resolveAccess(auth, allowedRoles) {
  const { state, role } = auth;
  if (state === "loading") return { type: "loading" };
  if (state === "unauthenticated") return { type: "redirect", to: "/login" };
  if (state === "error") return { type: "error" };
  if (state === "no_profile") return { type: "no_profile" };
  if (STATE_ROUTE[state]) return { type: "redirect", to: STATE_ROUTE[state] };
  if (state !== "active") return { type: "redirect", to: "/account-setup-required" };
  if (allowedRoles && !allowedRoles.includes(role)) return { type: "redirect", to: "/unauthorized" };   // valid account, wrong area
  return { type: "allow" };
}

/** Where to send someone right after login. */
export function landingFor(state) {
  return STATE_ROUTE[state] || "/";
}

/** Status pages (/pending-approval ...) are only for people who are actually in that state. */
export function resolveStatusPage(auth, requiredState, { justRegistered = false } = {}) {
  const { state } = auth;
  if (state === "loading") return { type: "loading" };
  if (state === "unauthenticated") return justRegistered && requiredState === "pending" ? { type: "allow" } : { type: "redirect", to: "/login" };
  if (state === requiredState) return { type: "allow" };
  if (state === "error") return { type: "error" };
  if (state === "no_profile") return { type: "no_profile" };
  return { type: "redirect", to: landingFor(state) };
}
