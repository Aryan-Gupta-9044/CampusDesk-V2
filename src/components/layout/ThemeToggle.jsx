import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import Icon from "../ui/Icon";

const OPTIONS = [["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "Match device", "panel"]];

export default function ThemeToggle() {
  const { mode, resolved, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="nav-item" ref={ref}>
      <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={open}
        aria-label={`Theme: ${mode === "system" ? "match device" : mode}. Change theme`} onClick={() => setOpen((o) => !o)}>
        <Icon name={resolved === "dark" ? "moon" : "sun"} size={19} />
      </button>
      {open && (
        <div className="dropdown theme-menu" role="menu" aria-label="Choose theme">
          {OPTIONS.map(([value, label, icon]) => (
            <button key={value} type="button" role="menuitemradio" aria-checked={mode === value} className="dd-item"
              onClick={() => { setMode(value); setOpen(false); }}>
              <Icon name={icon} size={15} /> {label}
            </button>))}
        </div>)}
    </div>
  );
}
