import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { resolveAccess } from "../auth/accessRules";
import { useAuth } from "../context/AuthContext";
import { PageLoading } from "./ui/States";
import AccountProblem from "./account/AccountProblem";

/**
 * Guards a route tree. Order of checks (see auth/accessRules.js):
 * loading -> not logged in (/login) -> account problem pages (pending, rejected, suspended, incomplete)
 * -> wrong role (/unauthorized) -> allow.
 * The database enforces the same rules with RLS; this is the UX layer, not the security layer.
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const auth = useAuth();
  const location = useLocation();
  const decision = resolveAccess({ state: auth.state, role: auth.role }, allowedRoles);

  if (decision.type === "loading") return <PageLoading label="Loading your workspace…" />;
  if (decision.type === "redirect") return <Navigate to={decision.to} replace state={decision.to === "/login" ? { from: location } : undefined} />;
  if (decision.type === "error" || decision.type === "no_profile") return <AccountProblem kind={decision.type} />;
  return children || <Outlet />;
}
