import React from "react";

import { useAuth } from "../../context/AuthContext";
import AdminFees from "../admin/AdminFees";
import Fees from "./Fees";

function FeesRouter() {
  const { role } = useAuth();
  if (role === "admin") return <AdminFees />;
  return <Fees />;
}

export default FeesRouter;
