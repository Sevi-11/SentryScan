"use client";

import { useEffect } from "react";

/**
 * Blocks the common shortcuts and right-click path into DevTools.
 * This is a deterrent, not a security boundary — it's trivially bypassed via
 * the browser's own menu (More tools -> Developer tools), a different
 * browser, or disabling JS. Don't rely on it to protect anything sensitive.
 */
export default function DevToolsGuard() {
  useEffect(() => {
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();

    const blockDevToolsKeys = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isDevToolsCombo =
        key === "f12" ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(key)) ||
        ((e.ctrlKey || e.metaKey) && key === "u");
      if (isDevToolsCombo) e.preventDefault();
    };

    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("keydown", blockDevToolsKeys);
    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockDevToolsKeys);
    };
  }, []);

  return null;
}
