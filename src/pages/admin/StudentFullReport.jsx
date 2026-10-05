import React from "react";
import { useParams } from "react-router-dom";

import StudentReportView from "../../components/report/StudentReportView";

// Admin view of the same professional report students and parents see (but with all marks, published or not).
export default function StudentFullReport() {
  const { id } = useParams();
  return <StudentReportView studentId={id} backTo={`/students/${id}`} />;
}
