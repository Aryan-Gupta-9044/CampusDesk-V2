import React from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useChild } from "../../context/ChildContext";
import { breadcrumbsFor } from "../../config/navigation";
import Icon from "../ui/Icon";
import GlobalSearch from "./GlobalSearch";
import NotificationCenter from "./NotificationCenter";

export default function Topbar({ onToggleSidebar, onOpenMobile }) {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const { children: kids, child, select } = useChild();
  const crumbs = breadcrumbsFor(role, pathname);
  return (
    <header className="topbar">
      <button type="button" className="icon-btn side-toggle-desktop" aria-label="Collapse or expand sidebar" onClick={onToggleSidebar}><Icon name="panel" size={19} /></button>
      <button type="button" className="icon-btn side-toggle-mobile" aria-label="Open navigation menu" onClick={onOpenMobile}><Icon name="menu" size={20} /></button>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>{crumbs.map((c, i) => (
          <li key={i} aria-current={i === crumbs.length - 1 ? "page" : undefined}>
            {c.to && i < crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
          </li>))}</ol>
      </nav>
      <div className="nav-spacer" />
      {role === "parent" && child && (
        <div className="child-badge" title="Child whose data is shown">
          <span className="feed-meta">Viewing</span>
          {kids.length > 1 ? (
            <><label className="sr-only" htmlFor="child-switch">Select child</label>
              <select id="child-switch" className="child-switch" value={child.id} onChange={(e) => select(e.target.value)}>
                {kids.map((k) => <option key={k.id} value={k.id}>{k.profiles?.full_name} · {k.classes?.name}-{k.classes?.section}</option>)}
              </select></>
          ) : <b>{child.profiles?.full_name} · {child.classes?.name}-{child.classes?.section}</b>}
        </div>
      )}
      <GlobalSearch />
      <NotificationCenter />
    </header>
  );
}
