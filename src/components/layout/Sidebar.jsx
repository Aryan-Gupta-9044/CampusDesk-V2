import React from "react";
import { Link, NavLink } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { NAV, NAV_ICON, PROFILE_MENU, isActivePath } from "../../config/navigation";
import { avatarClass, initials, ROLE_LABEL } from "../../lib/format";
import Icon from "../ui/Icon";
import GlobalSearch from "./GlobalSearch";

export default function Sidebar({ collapsed, mobileOpen, onClose, onLogout, pathname }) {
  const { profile, role } = useAuth();
  const items = NAV[role] || [];
  const link = (i) => {
    const active = isActivePath(pathname, i.to);
    return (
      <NavLink key={i.to} to={i.to} end={i.to === "/"} className={`side-link ${active ? "active" : ""}`}
        aria-current={active ? "page" : undefined} title={collapsed ? i.label : undefined} onClick={onClose}>
        <Icon name={NAV_ICON[i.to] || "file"} size={18} />
        <span className="side-label">{i.label}</span>
      </NavLink>
    );
  };
  return (
    <>
      {mobileOpen && <div className="side-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`app-sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "open" : ""}`} aria-label="Primary">
        <Link to="/" className="brand side-brand" aria-label="CampusDesk home" onClick={onClose}>
          <span className="brand-mark" aria-hidden="true">C</span><span className="side-label">CampusDesk</span>
        </Link>
        <div className="side-mobile-search"><GlobalSearch mobile onNavigate={onClose} /></div>
        <nav className="side-nav">
          {items.map((item) => item.items ? (
            <div key={item.label} className="side-group">
              <div className="side-group-title">{item.label}</div>
              {item.items.map(link)}
            </div>
          ) : <div key={item.to} className="side-group">{link(item)}</div>)}
        </nav>
        <div className="side-foot">
          {PROFILE_MENU.map((p) => (
            <NavLink key={p.to} to={p.to} className={`side-link ${isActivePath(pathname, p.to) ? "active" : ""}`} title={collapsed ? p.label : undefined} onClick={onClose}>
              <Icon name={p.to === "/settings" ? "settings" : "user"} size={18} /><span className="side-label">{p.label}</span>
            </NavLink>))}
          <button type="button" className="side-link side-logout" onClick={onLogout} title={collapsed ? "Logout" : undefined}>
            <Icon name="logout" size={18} /><span className="side-label">Logout</span>
          </button>
          <div className="side-user">
            <span className={`avatar ${avatarClass(profile?.full_name)}`}>{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile?.full_name)}</span>
            <span className="side-label"><b>{profile?.full_name}</b><br /><small>{ROLE_LABEL[role]}</small></span>
          </div>
        </div>
      </aside>
    </>
  );
}
