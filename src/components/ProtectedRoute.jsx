import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { PageLoading } from "./ui/States";

/**
 * Guards a route tree. Not logged in -> /login. Logged in but role not in
 * `allowedRoles` -> /unauthorized. This is real route protection, not just
 * hidden buttons; RLS enforces the same rules in the database.
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { session, profile, loading, profileError, isSuspended, signOut } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoading label="Loading your workspace…" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;

  if (profileError || !profile) {
    return (
      <div className="auth-page">
        <div className="card" style={{ maxWidth: 440, textAlign: "center" }}>
          <h2>Profile not found</h2>
          <p className="lede">Your account is signed in, but no profile record could be loaded. Ask an administrator to check your account.</p>
          <button type="button" className="btn btn-primary" onClick={signOut}>Log out</button>
        </div>
      </div>
    );
  }
  if (isSuspended) return <Navigate to="/suspended" replace />;
  if (allowedRoles && !allowedRoles.includes(profile.role)) return <Navigate to="/unauthorized" replace />;
  return children || <Outlet />;
}
