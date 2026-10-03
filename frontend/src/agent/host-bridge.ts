import type { Message, Request, Response, Box } from "../protocol";
interface PendingRequest {
  id: string;
  type: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (data: Response) => void;
  reject: (error: Error) => void;
}

export function setMode(mode: "select" | "interact") {
  currentMode = mode;
  iframeMap.forEach((port) => port.postMessage({ type: "SET_MODE", mode }));
  notifyOverlay(); // so the host can hide outlines
}
export const getMode = () => currentMode;

export interface OverlayData {
  hover: Box | null;
  selected: Box[];
}
const overlayData = new Map<HTMLIFrameElement, OverlayData>();
const overlayListeners = new Set<() => void>();
let currentMode: "select" | "interact" = "select";

let selectionLost = false;
export const wasSelectionLost = () => selectionLost;

// The selected elements and the preview they live in (null = nothing selected).
// `boxes` is a new array whenever the selection or its rects change, but not on hover.
export function getSelection() {
  for (const [iframe, d] of overlayData)
    if (d.selected.length) return { iframe, boxes: d.selected };
  return null;
}

export const getOverlay = (iframe: HTMLIFrameElement): OverlayData =>
  overlayData.get(iframe) ?? { hover: null, selected: [] };

export function onOverlayChange(listener: () => void) {
  overlayListeners.add(listener);
  return () => {
    overlayListeners.delete(listener);
  };
}
const notifyOverlay = () => overlayListeners.forEach((l) => l());

const iframeMap = new Map<HTMLIFrameElement, MessagePort>();
const iframeDocIds = new Map<HTMLIFrameElement, string>(); // which document each port belongs to
const pendingRequestsPerIframe = new Map<
  HTMLIFrameElement,
  Map<string, PendingRequest>
>();
const iframeTimeouts = new Map<
  HTMLIFrameElement,
  ReturnType<typeof setTimeout>
>();
const iframeErrors = new Map<HTMLIFrameElement, string | null>(); // null = no error, string = error message
const watchedIframes = new Set<HTMLIFrameElement>();
const errorListeners = new Set<() => void>();
const REQUEST_TIMEOUT = 3000;
const CONNECT_TIMEOUT = 10000;
const PAGES_ORIGIN = "http://localhost:4001";

export function getIframeError(iframe: HTMLIFrameElement): string | null {
  return iframeErrors.get(iframe) || null;
}

// React subscribes here and gets told only when an error actually changes
export function onErrorChange(listener: () => void) {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

function setError(iframe: HTMLIFrameElement, error: string | null) {
  if ((iframeErrors.get(iframe) ?? null) === error) return;
  iframeErrors.set(iframe, error);
  errorListeners.forEach((listener) => listener());
}

export function initAgent() {
  // Attach listener immediately (before iframes load)
  window.addEventListener("message", handleHandshake);

  // Return cleanup function (removes listener on hot reload)
  return () => {
    window.removeEventListener("message", handleHandshake);
  };
}

function armConnectTimeout(iframe: HTMLIFrameElement) {
  clearTimeout(iframeTimeouts.get(iframe));
  const timeout = setTimeout(() => {
    if (!iframeMap.has(iframe)) {
      console.error("Timeout: Couldn't connect to this preview");
      setError(iframe, "Couldn't connect to this preview");
    }
  }, CONNECT_TIMEOUT);
  iframeTimeouts.set(iframe, timeout);
}

// Called from the iframe's ref callback, so the 10s clock starts when the
// iframe actually mounts. Doesn't depend on the agent ever saying hello.
export function watchIframe(iframe: HTMLIFrameElement) {
  if (watchedIframes.has(iframe)) return;
  watchedIframes.add(iframe);
  armConnectTimeout(iframe);
}

// Others (the layers tree) subscribe here to drop what they cached for an iframe's old document.
// A subscription instead of an import, because tree.ts already imports this file.
const resetListeners = new Set<(iframe: HTMLIFrameElement) => void>();
export function onIframeReset(listener: (iframe: HTMLIFrameElement) => void) {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}

// Drop the port and fail everything still waiting on it
function teardown(iframe: HTMLIFrameElement, reason: string) {
  resetListeners.forEach((l) => l(iframe));
  pendingRequestsPerIframe.get(iframe)?.forEach((req) => {
    clearTimeout(req.timeout);
    req.reject(new Error(reason));
  });
  pendingRequestsPerIframe.delete(iframe);
  iframeMap.get(iframe)?.close();
  iframeMap.delete(iframe);
  iframeDocIds.delete(iframe);
  overlayData.delete(iframe);
  notifyOverlay();
}

// Retry just this preview, not the whole host
export function retryIframe(iframe: HTMLIFrameElement) {
  teardown(iframe, "Retry");
  setError(iframe, null);
  armConnectTimeout(iframe);
  iframe.setAttribute("src", iframe.getAttribute("src") ?? ""); // re-setting src reloads only this iframe
}

function handleHandshake(event: MessageEvent<Message>) {
  if (event.origin !== PAGES_ORIGIN) return;

  // Find the iframe that sent this message (search all, not just cached list)
  const allIframes = Array.from(document.querySelectorAll("iframe"));
  const sourceIframe = allIframes.find((i) => i.contentWindow === event.source);
  if (!sourceIframe) return;

  if (event.data.type === "AGENT_HELLO") {
    const docId = event.data.docId;

    // Same document retrying its hello: already connected, ignore
    if (iframeDocIds.get(sourceIframe) === docId) return;

    console.log(`Agent said hello from ${docId}`);

    // Different docId with a port still open means the page navigated
    if (iframeMap.has(sourceIframe)) {
      console.log(
        `Navigation detected on ${docId}. Canceling pending requests.`,
      );
      teardown(sourceIframe, "Navigation: page changed");
    }

    // Initialize fresh request map and remember which document owns this port
    pendingRequestsPerIframe.set(sourceIframe, new Map());
    iframeDocIds.set(sourceIframe, docId);

    // Create MessageChannel for this iframe
    const channel = new MessageChannel();
    iframeMap.set(sourceIframe, channel.port1);

    // Send the other port to the agent
    console.log(`Sending AGENT_READY to ${docId}`);
    sourceIframe.contentWindow?.postMessage(
      { type: "AGENT_READY", port: channel.port2 },
      PAGES_ORIGIN,
      [channel.port2],
    );

    // Listen on our port
    channel.port1.onmessage = (portEvent) =>
      handleAgentMessage(sourceIframe, portEvent);
    channel.port1.start();

    // Test: send ping with ID
    channel.port1.postMessage({ id: `ping-${Date.now()}`, type: "PING" });
    channel.port1.postMessage({ type: "SET_MODE", mode: getMode() }); // tell the agent what mode we're in

    // Handshake succeeded: clear the timeout and any error (also covers a late connect)
    clearTimeout(iframeTimeouts.get(sourceIframe));
    iframeTimeouts.delete(sourceIframe);
    setError(sourceIframe, null);
  }
}

// One place for "this box was picked": a click in a preview, or a row in the layers panel.
function select(iframe: HTMLIFrameElement, box: Box, shift: boolean) {
  selectionLost = false;
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
  overlayData.forEach((d, i) => {
    iframeMap
      .get(i)
      ?.postMessage({ type: "TRACK", ids: d.selected.map((b) => b.id) });
  });
  notifyOverlay();
}

// A layers row was clicked / Enter: ask the agent for the box, then select it like a click would.
export async function selectNode(iframe: HTMLIFrameElement, id: string) {
  const res = await queryAgent(iframe, "NAVIGATE", { from: id, dir: "self" });
  const box = res.box as Box | null;
  if (box) select(iframe, box, false);
}

function handleAgentMessage(
  iframe: HTMLIFrameElement,
  event: MessageEvent<Response>,
) {
  const { id } = event.data;
  console.log("Received from agent:", event.data);
  const msg = event.data as unknown as Message;
  if (id) {
    // This is a response to a request — look it up in this iframe's queue
    const iframeRequests = pendingRequestsPerIframe.get(iframe);
    const pending = iframeRequests?.get(id);
    if (iframeRequests && pending) {
      clearTimeout(pending.timeout);
      pending.resolve(event.data);
      iframeRequests.delete(id);
    }
  }

  if (event.data.type === "PONG") {
    console.log("✓ Ping-pong successful");
  }

  if (msg.type === "HOVER") {
    overlayData.set(iframe, { ...getOverlay(iframe), hover: msg.box });
    notifyOverlay();
  }
  if (msg.type === "SELECT") select(iframe, msg.box, msg.shift);

  if (msg.type === "KEY") handleKey(msg.key, msg.shift);

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
}

// null = pointer left the row. The agent answers with the normal HOVER message.
export function hoverNode(iframe: HTMLIFrameElement, from: string | null) {
  iframeMap.get(iframe)?.postMessage({ type: "HOVER_NODE", from });
}

export function sendToAgent(iframe: HTMLIFrameElement, message: Request) {
  const port = iframeMap.get(iframe);
  if (port) {
    port.postMessage(message);
  } else {
    console.error("Agent not connected for this iframe");
  }
}

export async function queryAgent(
  iframe: HTMLIFrameElement,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<Response> {
  const port = iframeMap.get(iframe);
  if (!port) throw new Error("Agent not connected");

  const iframeRequests = pendingRequestsPerIframe.get(iframe);
  if (!iframeRequests) throw new Error("No request queue for this iframe");

  const id = `${Date.now()}-${Math.random()}`;
  const request = { id, type, ...payload };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      iframeRequests.delete(id);
      reject(new Error(`Request timeout: ${type}`));
    }, REQUEST_TIMEOUT);

    iframeRequests.set(id, { id, type, timeout, resolve, reject });
    port.postMessage(request);
  });
}

function navigate(key: string, shift: boolean): boolean {
  const owner = [...overlayData].find(([, d]) => d.selected.length === 1);
  if (!owner) return false; // nothing to move from, leave the key alone
  const [iframe, d] = owner;
  const dir = key === "Enter" ? (shift ? "parent" : "child") : (shift ? "prev" : "next");

  const from = d.selected[0].id;
  queryAgent(iframe, "NAVIGATE", { from, dir })
    .then((res) => {
      const box = res.box as Box | null;
      if (!box) return; // dead end: stay put
      // stale reply: Esc, a click or another Tab changed the selection while we waited
      const now = getOverlay(iframe).selected;
      if (now.length !== 1 || now[0].id !== from) return;
      overlayData.set(iframe, { ...getOverlay(iframe), selected: [box] });
      iframeMap.get(iframe)?.postMessage({ type: "TRACK", ids: [box.id] });
      notifyOverlay();
    })
    .catch(() => {}); // timeout or preview gone: keep the selection
  return true;
}
function clearSelection() {
  selectionLost = false; // Esc is the user's choice, not a vanished element
  overlayData.forEach((d, i) => {
    overlayData.set(i, { ...d, selected: [] });
    iframeMap.get(i)?.postMessage({ type: "TRACK", ids: [] });
  });
  notifyOverlay();
}

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
  if (currentMode === "select" && (key === "Enter" || key === "Tab"))
    return navigate(key, shift);
  return false;
}
