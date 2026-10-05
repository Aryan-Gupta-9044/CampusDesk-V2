import React from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { ChildProvider } from "./context/ChildContext";
import { ToastProvider } from "./components/ui/Toast";
import AppLayout from "./components/layout/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import Unauthorized from "./pages/auth/Unauthorized";
import Suspended from "./pages/auth/Suspended";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";

import RoleRouter from "./pages/dashboards/RoleRouter";
import Settings from "./pages/account/Settings";
import Profile from "./pages/account/Profile";
import NotificationsPage from "./pages/shared/NotificationsPage";
import PaymentHistory from "./pages/shared/PaymentHistory";
import MyClasses from "./pages/teacher/MyClasses";

import AdminStudents from "./pages/admin/AdminStudents";
import AddStudent from "./pages/admin/AddStudent";
import ImportStudents from "./pages/admin/ImportStudents";
import StudentDetail from "./pages/admin/StudentDetail";
import StudentFullReport from "./pages/admin/StudentFullReport";
import AdminTeachers from "./pages/admin/AdminTeachers";
import AddTeacher from "./pages/admin/AddTeacher";
import ImportTeachers from "./pages/admin/ImportTeachers";
import TeacherDetail from "./pages/admin/TeacherDetail";
import TeacherFullReport from "./pages/admin/TeacherFullReport";
import AdminParents from "./pages/admin/AdminParents";
import Classes from "./pages/admin/Classes";
import AuditLog from "./pages/admin/AuditLog";

import Attendance from "./pages/shared/Attendance";
import ResultsRouter from "./pages/shared/ResultsRouter";
import FeesRouter from "./pages/shared/FeesRouter";
import Notices from "./pages/shared/Notices";
import Events from "./pages/shared/Events";
import LeaveRequests from "./pages/shared/LeaveRequests";
import Timetable from "./pages/shared/Timetable";
import Documents from "./pages/shared/Documents";
import ChatWithTeacher from "./pages/shared/ChatWithTeacher";
import AcademicReport from "./pages/shared/AcademicReport";

const ALL = ["admin", "teacher", "student", "parent"];
const guard = (roles, el) => <ProtectedRoute allowedRoles={roles}>{el}</ProtectedRoute>;

// HashRouter keeps every route working on static hosting (GitHub Pages) even
// after a browser refresh, with no server-side rewrite rules needed.
export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ChildProvider>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/unauthorized" element={<Unauthorized />} />
              <Route path="/suspended" element={<Suspended />} />

              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<RoleRouter />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/notifications" element={<NotificationsPage />} />

                {/* Shared modules (each page adapts to the role) */}
                <Route path="/timetable" element={guard(ALL, <Timetable />)} />
                <Route path="/attendance" element={guard(ALL, <Attendance />)} />
                <Route path="/results" element={guard(ALL, <ResultsRouter />)} />
                <Route path="/report" element={guard(ALL, <AcademicReport />)} />
                <Route path="/notices" element={guard(ALL, <Notices />)} />
                <Route path="/events" element={guard(ALL, <Events />)} />
                <Route path="/documents" element={guard(ALL, <Documents />)} />
                <Route path="/chat" element={guard(["teacher", "student", "parent"], <ChatWithTeacher />)} />
                <Route path="/leave" element={guard(["admin", "teacher", "student"], <LeaveRequests />)} />
                <Route path="/fees" element={guard(["admin", "student", "parent"], <FeesRouter />)} />
                <Route path="/payment-history" element={guard(["student", "parent"], <PaymentHistory />)} />

                {/* Teacher */}
                <Route path="/my-classes" element={guard(["teacher"], <MyClasses />)} />

                {/* Admin */}
                <Route path="/students" element={guard(["admin"], <AdminStudents />)} />
                <Route path="/students/new" element={guard(["admin"], <AddStudent />)} />
                <Route path="/students/import" element={guard(["admin"], <ImportStudents />)} />
                <Route path="/students/:id" element={guard(["admin"], <StudentDetail />)} />
                <Route path="/students/:id/report" element={guard(["admin"], <StudentFullReport />)} />
                <Route path="/teachers" element={guard(["admin"], <AdminTeachers />)} />
                <Route path="/teachers/new" element={guard(["admin"], <AddTeacher />)} />
                <Route path="/teachers/import" element={guard(["admin"], <ImportTeachers />)} />
                <Route path="/teachers/:id" element={guard(["admin"], <TeacherDetail />)} />
                <Route path="/teachers/:id/report" element={guard(["admin"], <TeacherFullReport />)} />
                <Route path="/parents" element={guard(["admin"], <AdminParents />)} />
                <Route path="/classes" element={guard(["admin"], <Classes />)} />
                <Route path="/audit-log" element={guard(["admin"], <AuditLog />)} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </ChildProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
