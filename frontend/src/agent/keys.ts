// Keyboard shortcuts: V, I, Esc, and Enter / Shift+Enter / Tab / Shift+Tab to move the
// selection. Used for keys the host sees itself and keys a preview forwards as KEY.
import type { Box } from "../protocol";
import { onAgentMessage, queryAgent } from "./connection";
import {
  clearSelection,
  getMode,
  getSoleSelection,
  moveSelection,
  setMode,
} from "./overlay";

// Enter and Tab need the page's DOM ("the child of this element"), so they are a request.
function navigate(key: string, shift: boolean): boolean {
  const sole = getSoleSelection();
  if (!sole) return false; // nothing to move from, leave the key alone
  const dir =
    key === "Enter" ? (shift ? "parent" : "child") : shift ? "prev" : "next";

  queryAgent(sole.iframe, "NAVIGATE", { from: sole.id, dir })
    .then((res) => {
      const box = res.box as Box | null;
      if (box) moveSelection(sole.iframe, sole.id, box); // no box = dead end: stay put
    })
    .catch(() => {}); // timeout or preview gone: keep the selection
  return true;
}

// true = we used the key, so the caller should preventDefault
export function handleKey(key: string, shift: boolean): boolean {
  if (key === "v" || key === "V") {
    setMode("select");
    return true;
  }
  if (key === "i" || key === "I") {
    setMode("interact");
    return true;
  }
  if (key === "Escape") {
    clearSelection();
    return true;
  }
  if (getMode() === "select" && (key === "Enter" || key === "Tab"))
    return navigate(key, shift);
  return false;
}

// a key typed inside a preview never reaches the host, so the agent forwards it
onAgentMessage((_iframe, msg) => {
  if (msg.type === "KEY") handleKey(msg.key, msg.shift);
});
