import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import AccountLayout from "../../components/account/AccountLayout";
import { useAuth } from "../../context/AuthContext";
import { formatDate } from "../../lib/dates";

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "—");

function useLogout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return async () => { await signOut(); navigate("/login", { replace: true }); };
}

export function PendingApproval() {
  const { account, user, refreshAccount, session } = useAuth();
  const { state: nav } = useLocation();
  const logout = useLogout();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const email = account?.email || user?.email || nav?.email || "—";
  const requested = account?.requestedRole || nav?.requestedRole;
  const check = async () => { setChecking(true); await refreshAccount(); setChecking(false); setChecked(true); };   // StatusRoute redirects automatically once approved
  return (
    <AccountLayout icon="clock" tone="info" eyebrow="Registration submitted" title="Your account is waiting for administrator approval"
      details={[["Registered email", email], ["Requested account", requested ? cap(requested) : "Not specified"], ["Status", "Pending administrator approval"]]}
      actions={<>
        {session && <button type="button" className="btn btn-primary" onClick={check} disabled={checking}>{checking ? "Checking…" : "Check status"}</button>}
        {session ? <button type="button" className="btn btn-outline" onClick={logout}>Log out</button> : <Link className="btn btn-primary" to="/login">Back to login</Link>}
      </>}>
      <p>Your CampusDesk account has been created. You will be able to use CampusDesk once an administrator has reviewed and activated it.</p>
      {!session && nav?.needsEmailConfirmation && <p className="notice-inline info" role="status">We sent a confirmation link to <b>{email}</b>. Confirm your email first, then log in to see your status.</p>}
      {checked && <p className="feed-meta" role="status">Still pending — we'll show your dashboard as soon as you're approved.</p>}
    </AccountLayout>
  );
}

export function RegistrationRejected() {
  const { account } = useAuth();
  const logout = useLogout();
  return (
    <AccountLayout icon="alert" tone="danger" eyebrow="Registration not approved" title="Your CampusDesk registration was not approved"
      details={account?.rejectionReason ? [["Reason from the administrator", account.rejectionReason]] : []}
      actions={<button type="button" className="btn btn-primary" onClick={logout}>Back to login</button>}>
      <p>If you think this is a mistake, please contact the school office.</p>
    </AccountLayout>
  );
}

export function AccountSuspended() {
  const { account } = useAuth();
  const logout = useLogout();
  return (
    <AccountLayout icon="alert" tone="warning" eyebrow="Account suspended" title="Your account is suspended"
      details={account?.statusReason ? [["Note from the administrator", account.statusReason]] : []}
      actions={<button type="button" className="btn btn-primary" onClick={logout}>Log out</button>}>
      <p>Your records are safe, but you can't use CampusDesk right now. Please contact an administrator to have your account reactivated.</p>
    </AccountLayout>
  );
}

export function AccountSetupRequired() {
  const { refreshAccount } = useAuth();
  const logout = useLogout();
  const [busy, setBusy] = useState(false);
  return (
    <AccountLayout icon="settings" tone="warning" eyebrow="Account setup required" title="Your account setup is not finished"
      actions={<>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); await refreshAccount(); setBusy(false); }}>{busy ? "Checking…" : "Check again"}</button>
        <button type="button" className="btn btn-outline" onClick={logout}>Log out</button>
      </>}>
      <p>Your account was approved, but an administrator still has to complete your details (for example your class or employee record). You'll be able to continue as soon as that is done.</p>
    </AccountLayout>
  );
}

/** Valid, active account - but this area belongs to a different role. */
export function Unauthorized() {
  const logout = useLogout();
  return (
    <AccountLayout icon="alert" tone="danger" eyebrow="Access restricted" title="You don't have access to this page"
      actions={<>
        <Link className="btn btn-primary" to="/">Back to my dashboard</Link>
        <button type="button" className="btn btn-outline" onClick={logout}>Log out</button>
      </>}>
      <p>Your account is active, but this area is limited to a different role. If you think this is wrong, contact your administrator.</p>
    </AccountLayout>
  );
}
