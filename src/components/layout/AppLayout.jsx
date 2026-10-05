import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useToast } from "../ui/Toast";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const KEY = "campusdesk-sidebar-collapsed";

export default function AppLayout() {
  const { signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); window.scrollTo?.(0, 0); }, [pathname]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(KEY, c ? "0" : "1"); } catch { /* ignore */ } return !c; });
  const logout = async () => { await signOut(); toast("You have been logged out."); navigate("/login", { replace: true }); };

  return (
    <div className={`app-body ${collapsed ? "is-collapsed" : ""}`}>
      <a href="#main" className="sr-only">Skip to content</a>
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} onLogout={logout} pathname={pathname} />
      <div className="app-content">
        <Topbar onToggleSidebar={toggle} onOpenMobile={() => setMobileOpen(true)} />
        <main id="main" className="app-main"><Outlet /></main>
      </div>
    </div>
  );
}
