import { useEffect } from "react";
import { handleKey } from "../agent/keys";
import { BOARD, guard } from "../regions";

// Keyboard shortcuts for keys the host page sees. Keys typed inside a preview arrive
// as KEY messages instead (see agent/keys.ts).
export function useShortcuts() {
  useEffect(() => {
    const onKey = guard(BOARD, (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // browser shortcuts: Ctrl+V, Ctrl+Shift+I...
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
        return;
      // Enter and Tab belong to focused buttons, links and the layers tree
      if (
        (e.key === "Enter" || e.key === "Tab") &&
        t.closest("button, a, [role=button], [role=tree]")
      )
        return;
      if (handleKey(e.key, e.shiftKey)) e.preventDefault();
    });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
