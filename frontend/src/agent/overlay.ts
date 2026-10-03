// What the host draws on top of the previews and what the panels read: mode, hover,
// selection, and the active preview. It is the only place that changes them.
import type { Box } from "../protocol";
import {
  broadcast,
  onAgentMessage,
  onIframeConnect,
  onIframeReset,
  postToAgent,
  queryAgent,
} from "./connection";

export interface OverlayData {
  hover: Box | null;
  selected: Box[];
}

const overlayData = new Map<HTMLIFrameElement, OverlayData>();
const overlayListeners = new Set<() => void>();
let currentMode: "select" | "interact" = "select";

// Active preview: the one last clicked in Select mode. Kept after Esc or a navigation.
let activeIframe: HTMLIFrameElement | null = null;
let selectionLost = false;

// ---- reading ----
export const getMode = () => currentMode;
export const getActiveIframe = () => activeIframe;
export const wasSelectionLost = () => selectionLost;

export const getOverlay = (iframe: HTMLIFrameElement): OverlayData =>
  overlayData.get(iframe) ?? { hover: null, selected: [] };

// The selected elements and the preview they live in (null = nothing selected).
// `boxes` is a new array whenever the selection or its rects change, but not on hover.
export function getSelection() {
  for (const [iframe, d] of overlayData)
    if (d.selected.length) return { iframe, boxes: d.selected };
  return null;
}

// The preview and element id when exactly one element is selected, else null
export function getSoleSelection() {
  const found = [...overlayData].find(([, d]) => d.selected.length === 1);
  return found ? { iframe: found[0], id: found[1].selected[0].id } : null;
}

export function onOverlayChange(listener: () => void) {
  overlayListeners.add(listener);
  return () => {
    overlayListeners.delete(listener);
  };
}
const notifyOverlay = () => overlayListeners.forEach((l) => l());

// ---- changing ----
export function setMode(mode: "select" | "interact") {
  currentMode = mode;
  broadcast({ type: "SET_MODE", mode });
  notifyOverlay(); // so the host can hide outlines
}

// Tell every agent which elements to follow
function trackSelection() {
  overlayData.forEach((d, iframe) =>
    postToAgent(iframe, { type: "TRACK", ids: d.selected.map((b) => b.id) }),
  );
}

// One place for "this box was picked": a click in a preview, or a row in the layers panel.
function select(iframe: HTMLIFrameElement, box: Box, shift: boolean) {
  selectionLost = false;
  activeIframe = iframe; // the layers panel follows the last preview picked in Select mode
  const mine = getOverlay(iframe).selected;
  let selected: Box[];
  if (!shift) selected = [box];
  else if (mine.some((b) => b.id === box.id))
    selected = mine.filter((b) => b.id !== box.id);
  else selected = [...mine, box];

  // README: plain click replaces the selection everywhere. Shift in a different preview does too.
  overlayData.forEach((d, other) => {
    if (other !== iframe && (!shift || selected.length))
      overlayData.set(other, { ...d, selected: [] });
  });
  overlayData.set(iframe, { ...getOverlay(iframe), selected });
  trackSelection();
  notifyOverlay();
}

// A layers row was clicked / Enter: ask the agent for the box, then select it like a click would.
export async function selectNode(iframe: HTMLIFrameElement, id: string) {
  const res = await queryAgent(iframe, "NAVIGATE", { from: id, dir: "self" });
  const box = res.box as Box | null;
  if (box) select(iframe, box, false);
}

// Keyboard move (Enter, Tab...): swap the one selected element `from` for `box`.
// Does nothing if the selection changed while we waited for the answer.
export function moveSelection(
  iframe: HTMLIFrameElement,
  from: string,
  box: Box,
) {
  const now = getOverlay(iframe).selected;
  if (now.length !== 1 || now[0].id !== from) return;
  overlayData.set(iframe, { ...getOverlay(iframe), selected: [box] });
  trackSelection();
  notifyOverlay();
}

export function clearSelection() {
  selectionLost = false; // Esc is the user's choice, not a vanished element
  overlayData.forEach((d, i) => overlayData.set(i, { ...d, selected: [] }));
  trackSelection();
  notifyOverlay();
}

// null = pointer left the row. The agent answers with the normal HOVER message.
export function hoverNode(iframe: HTMLIFrameElement, from: string | null) {
  postToAgent(iframe, { type: "HOVER_NODE", from });
}

// ---- what the previews tell us ----
onAgentMessage((iframe, msg) => {
  if (msg.type === "HOVER") {
    overlayData.set(iframe, { ...getOverlay(iframe), hover: msg.box });
    notifyOverlay();
  }

  if (msg.type === "SELECT") select(iframe, msg.box, msg.shift);

  if (msg.type === "GONE") {
    const cur = getOverlay(iframe);
    const selected = cur.selected.filter((b) => !msg.ids.includes(b.id));
    // the inspector says "This element no longer exists" when removal emptied the selection
    if (cur.selected.length && !selected.length) selectionLost = true;
    overlayData.set(iframe, {
      hover: cur.hover && msg.ids.includes(cur.hover.id) ? null : cur.hover,
      selected,
    });
    notifyOverlay();
  }

  if (msg.type === "RECT_UPDATE") {
    const fresh = new Map(msg.boxes.map((b) => [b.id, b]));
    const cur = getOverlay(iframe);
    overlayData.set(iframe, {
      hover: cur.hover ? (fresh.get(cur.hover.id) ?? cur.hover) : null,
      selected: cur.selected.map((b) => fresh.get(b.id) ?? b),
    });
    notifyOverlay();
  }
});

// a new preview document starts in whatever mode we are in
onIframeConnect((iframe) =>
  postToAgent(iframe, { type: "SET_MODE", mode: currentMode }),
);

// the preview's document was replaced: its boxes mean nothing now
onIframeReset((iframe) => {
  overlayData.delete(iframe);
  notifyOverlay();
});
