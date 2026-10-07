import React from "react";
import { Navigate, useLocation } from "react-router-dom";

import { resolveStatusPage } from "../../auth/accessRules";
import { useAuth } from "../../context/AuthContext";
import { PageLoading } from "../ui/States";
import AccountProblem from "./AccountProblem";

/** Wraps /pending-approval, /registration-rejected, /account-suspended, /account-setup-required. */
export default function StatusRoute({ state, children }) {
  const auth = useAuth();
  const location = useLocation();
  const d = resolveStatusPage({ state: auth.state }, state, { justRegistered: Boolean(location.state?.justRegistered) });
  if (d.type === "loading") return <PageLoading label="Checking your account…" />;
  if (d.type === "redirect") return <Navigate to={d.to} replace />;
  if (d.type === "error" || d.type === "no_profile") return <AccountProblem kind={d.type} />;
  return children;
}
