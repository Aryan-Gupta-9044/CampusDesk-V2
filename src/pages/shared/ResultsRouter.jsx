import React from "react";

import { useAuth } from "../../context/AuthContext";
import AdminExams from "../admin/AdminExams";
import Results from "./Results";

function ResultsRouter() {
  const { role } = useAuth();
  if (role === "admin") return <AdminExams />;
  return <Results />;
}

export default ResultsRouter;
