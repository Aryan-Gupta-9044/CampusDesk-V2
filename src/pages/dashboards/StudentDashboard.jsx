import React from "react";

import { useAuth } from "../../context/AuthContext";
import StudentOverview from "./StudentOverview";

export default function StudentDashboard() {
  const { user } = useAuth();
  return <StudentOverview studentId={user.id} requesterId={user.id} viewer="student" />;
}
