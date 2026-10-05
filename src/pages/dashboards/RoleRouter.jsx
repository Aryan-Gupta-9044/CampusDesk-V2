import React from "react";

import { useAuth } from "../../context/AuthContext";
import AdminDashboard from "./AdminDashboard";
import TeacherDashboard from "./TeacherDashboard";
import StudentDashboard from "./StudentDashboard";
import ParentDashboard from "./ParentDashboard";

const DASHBOARD_BY_ROLE = {
  admin: AdminDashboard,
  teacher: TeacherDashboard,
  student: StudentDashboard,
  parent: ParentDashboard,
};

function RoleRouter() {
  const { role } = useAuth();
  const Dashboard = DASHBOARD_BY_ROLE[role];
  if (!Dashboard) return null;
  return <Dashboard />;
}

export default RoleRouter;
