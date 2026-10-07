import React from "react";
import { useAuth } from "../../context/AuthContext";
import AccountLayout from "./AccountLayout";

/** Shown when the account cannot be loaded (network) or has no CampusDesk profile. */
export default function AccountProblem({ kind }) {
  const { refreshAccount, signOut } = useAuth();
  const noProfile = kind === "no_profile";
  return (
    <AccountLayout icon="alert" tone={noProfile ? "warning" : "danger"}
      eyebrow={noProfile ? "Account not provisioned" : "Connection problem"}
      title={noProfile ? "Your profile is not set up yet" : "We couldn't load your account"}
      actions={<>
        {!noProfile && <button type="button" className="btn btn-primary" onClick={() => refreshAccount()}>Try again</button>}
        <button type="button" className="btn btn-outline" onClick={signOut}>Log out</button>
      </>}>
      <p>{noProfile
        ? "Your account has been created but your CampusDesk profile has not been provisioned yet. Please contact an administrator."
        : "Something went wrong while checking your account. Please check your connection and try again."}</p>
    </AccountLayout>
  );
}
