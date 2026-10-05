import React from "react";
import { Link } from "react-router-dom";

function Unauthorized() {
  return (
    <div className="page form-page auth-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Access restricted</p>
          <h1>You don't have access to this page</h1>
          <p className="lede">
            This area is limited to a different role. If you think this is wrong, contact your
            administrator.
          </p>
        </div>
      </section>
      <Link className="button primary-button" to="/">
        Back to my dashboard
      </Link>
    </div>
  );
}

export default Unauthorized;
