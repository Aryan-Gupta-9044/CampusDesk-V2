import React from "react";
import { Link } from "react-router-dom";

function Suspended() {
  return (
    <div className="page form-page auth-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Account suspended</p>
          <h1>This account is currently suspended</h1>
          <p className="lede">
            Your access has been paused by an administrator. Historical records are kept —
            contact your school office to have the account reactivated.
          </p>
        </div>
      </section>
      <Link className="button secondary-button" to="/login">
        Back to login
      </Link>
    </div>
  );
}

export default Suspended;
