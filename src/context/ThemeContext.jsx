import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const KEY = "campusdesk-theme";            // "light" | "dark" | "system"
const ThemeContext = createContext({ mode: "system", resolved: "light", setMode: () => {} });

const systemTheme = () => (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
const read = () => { try { return localStorage.getItem(KEY) || "system"; } catch { return "system"; } };

function apply(resolved) {
  document.documentElement.dataset.theme = resolved;      // set synchronously so charts read the new colours
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#141817" : "#f4f1ea");
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(read);
  const [resolved, setResolved] = useState(() => (read() === "system" ? systemTheme() : read()));

  const setMode = useCallback((m) => {
    const next = m === "system" ? systemTheme() : m;
    apply(next);
    try { localStorage.setItem(KEY, m); } catch { /* storage unavailable */ }
    setModeState(m);
    setResolved(next);
  }, []);

  // Follow the operating-system setting while mode === "system"
  useEffect(() => {
    if (mode !== "system" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { const t = systemTheme(); apply(t); setResolved(t); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  // Printing (reports, receipts) is always light so it is readable on paper
  useEffect(() => {
    let before = null;
    const onBefore = () => { before = document.documentElement.dataset.theme; document.documentElement.dataset.theme = "light"; };
    const onAfter = () => { if (before) document.documentElement.dataset.theme = before; before = null; };
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => { window.removeEventListener("beforeprint", onBefore); window.removeEventListener("afterprint", onAfter); };
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
