import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { globalSearch } from "../../lib/services/search";
import Icon from "../ui/Icon";

export default function GlobalSearch({ onNavigate, mobile = false }) {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (term.trim().length < 2) { setResults([]); return undefined; }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await globalSearch(role, user.id, term);
        if (!cancelled) setResults(r);
      } catch (e) {
        if (import.meta.env.DEV) console.error("[CampusDesk] search:", e);
        if (!cancelled) setResults([]);
      } finally { if (!cancelled) setBusy(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [term, role, user]);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const grouped = results.reduce((acc, r) => { (acc[r.group] = acc[r.group] || []).push(r); return acc; }, {});
  const go = (r) => { setOpen(false); setTerm(""); onNavigate?.(); navigate(r.to); };
  const placeholder = { admin: "Search students, teachers, classes…", teacher: "Search students, classes…", student: "Search notices, events, subjects…", parent: "Search notices, events…" }[role] || "Search…";

  return (
    <div className={mobile ? "m-search" : "nav-search"} ref={ref} role="search">
      <label className="sr-only" htmlFor={`gs-${mobile ? "m" : "d"}`}>Search</label>
      {!mobile && <Icon name="search" size={15} />}
      <input
        id={`gs-${mobile ? "m" : "d"}`} type="search" value={term} placeholder={placeholder} autoComplete="off"
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      />
      {open && term.trim().length >= 2 && (
        <div className="search-results">
          {busy && results.length === 0 ? <p className="state-hint" style={{ padding: 10 }}>Searching…</p>
            : results.length === 0 ? <p className="state-hint" style={{ padding: 10 }}>No results found.</p>
            : Object.entries(grouped).map(([group, rows]) => (
              <div key={group}>
                <div className="search-group">{group}</div>
                {rows.map((r) => (
                  <button key={`${group}-${r.id}`} type="button" className="search-hit dd-item" onClick={() => go(r)} style={{ width: "100%", textAlign: "left", background: "none", border: 0, cursor: "pointer" }}>
                    {r.title}
                    {r.subtitle && <small>{r.subtitle}</small>}
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
