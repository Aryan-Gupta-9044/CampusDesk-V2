import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./AuthContext";
import { listChildren, setSelectedChild } from "../lib/queries/me";

const ChildContext = createContext({ children: [], child: null, loading: false, select: () => {} });

/** Parents may have several children; this keeps the selected one in sync everywhere. */
export function ChildProvider({ children: nodes }) {
  const { user, role } = useAuth();
  const [kids, setKids] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (role !== "parent" || !user) {
      setKids([]); setSelectedId(null); setSelectedChild(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    listChildren(user.id)
      .then((list) => {
        if (cancelled) return;
        const saved = localStorage.getItem(`campusdesk-child-${user.id}`);
        const pick = list.find((k) => k.id === saved)?.id || list[0]?.id || null;
        setKids(list);
        setSelectedId(pick);
        setSelectedChild(pick);
        setError(false);
      })
      .catch((err) => { if (import.meta.env.DEV) console.error(err); if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, role]);

  const value = useMemo(() => ({
    children: kids,
    child: kids.find((k) => k.id === selectedId) || null,
    loading,
    error,
    select: (id) => {
      setSelectedId(id);
      setSelectedChild(id);
      try { localStorage.setItem(`campusdesk-child-${user.id}`, id); } catch { /* storage unavailable */ }
    },
  }), [kids, selectedId, loading, error, user]);

  return <ChildContext.Provider value={value}>{nodes}</ChildContext.Provider>;
}

export const useChild = () => useContext(ChildContext);
