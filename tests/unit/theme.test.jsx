// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "../../src/context/ThemeContext";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let api;
const Probe = () => { api = useTheme(); return null; };
const roots = [];
const mount = () => { const el = document.createElement("div"); document.body.appendChild(el); const root = createRoot(el); roots.push(root); act(() => root.render(<ThemeProvider><Probe /></ThemeProvider>)); return root; };

function mockMatchMedia(dark) {
  const listeners = new Set();
  window.matchMedia = (q) => ({ matches: dark.value && q.includes("dark"), addEventListener: (_, f) => listeners.add(f), removeEventListener: (_, f) => listeners.delete(f) });
  return () => listeners.forEach((f) => f());
}

describe("ThemeProvider", () => {
  afterEach(() => { while (roots.length) act(() => roots.pop().unmount()); });
  beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("data-theme"); document.head.innerHTML = '<meta name="theme-color" content="#f4f1ea">'; });

  it("defaults to the device setting and applies it", () => {
    mockMatchMedia({ value: true }); mount();
    expect(api.mode).toBe("system"); expect(api.resolved).toBe("dark");
  });
  it("switching to dark sets data-theme synchronously, saves the choice and updates theme-color", () => {
    mockMatchMedia({ value: false }); mount();
    act(() => api.setMode("dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("campusdesk-theme")).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]').getAttribute("content")).toBe("#141817");
    act(() => api.setMode("light"));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("restores a saved choice on load", () => {
    localStorage.setItem("campusdesk-theme", "dark"); mockMatchMedia({ value: false }); mount();
    expect(api.mode).toBe("dark"); expect(api.resolved).toBe("dark");
  });
  it("follows the device when mode is 'system'", () => {
    const dark = { value: false }; const fire = mockMatchMedia(dark); mount();
    expect(api.resolved).toBe("light");
    dark.value = true; act(() => fire());
    expect(api.resolved).toBe("dark"); expect(document.documentElement.dataset.theme).toBe("dark");
  });
  it("always prints in light, then restores", () => {
    mockMatchMedia({ value: false }); mount(); act(() => api.setMode("dark"));
    window.dispatchEvent(new Event("beforeprint")); expect(document.documentElement.dataset.theme).toBe("light");
    window.dispatchEvent(new Event("afterprint")); expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
