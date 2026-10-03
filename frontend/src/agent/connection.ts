// The host's side of the wire to each preview: finding the iframe that says hello,
// the MessageChannel per document, requests that wait for a reply, and connect errors.
// It knows nothing about hover or selection. Others subscribe to what it hears:
// onAgentMessage, onIframeConnect, onIframeReset.
import type { Message, Response } from "../protocol";

interface PendingRequest {
  id: string;
  type: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (data: Response) => void;
  reject: (error: Error) => void;
}

const REQUEST_TIMEOUT = 3000;
const CONNECT_TIMEOUT = 10000;
const PAGES_ORIGIN = "http://localhost:4001";

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

// ---- subscriptions: a Set of listeners with an unsubscribe function ----
function listeners<A extends unknown[]>() {
  const set = new Set<(...args: A) => void>();
  return {
    add(listener: (...args: A) => void) {
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    emit: (...args: A) => set.forEach((l) => l(...args)),
  };
}
const agentMessageListeners = listeners<[HTMLIFrameElement, Message]>();
const connectListeners = listeners<[HTMLIFrameElement]>();
const resetListeners = listeners<[HTMLIFrameElement]>();
const errorListeners = listeners<[]>();

// Every message a preview sends that is not just the answer to a request
export const onAgentMessage = agentMessageListeners.add;
// A preview's document connected: the place to tell it what mode we are in
export const onIframeConnect = connectListeners.add;
// A preview's document was replaced (navigation or Retry): drop what was cached for it.
// A subscription and not an import, so the files that use this one never import each other.
export const onIframeReset = resetListeners.add;
// React subscribes here and gets told only when an error actually changes
export const onErrorChange = errorListeners.add;

// ---- talking to a preview ----
export function postToAgent(iframe: HTMLIFrameElement, message: Message) {
  iframeMap.get(iframe)?.postMessage(message);
}

export function broadcast(message: Message) {
  iframeMap.forEach((port) => port.postMessage(message));
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

// ---- connect errors ----
export function getIframeError(iframe: HTMLIFrameElement): string | null {
  return iframeErrors.get(iframe) || null;
}

function setError(iframe: HTMLIFrameElement, error: string | null) {
  if ((iframeErrors.get(iframe) ?? null) === error) return;
  iframeErrors.set(iframe, error);
  errorListeners.emit();
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

// ---- lifecycle ----
export function initAgent() {
  // Attach listener immediately (before iframes load)
  window.addEventListener("message", handleHandshake);

  // Return cleanup function (removes listener on hot reload)
  return () => {
    window.removeEventListener("message", handleHandshake);
  };
}

// Drop the port and fail everything still waiting on it
function teardown(iframe: HTMLIFrameElement, reason: string) {
  resetListeners.emit(iframe);
  pendingRequestsPerIframe.get(iframe)?.forEach((req) => {
    clearTimeout(req.timeout);
    req.reject(new Error(reason));
  });
  pendingRequestsPerIframe.delete(iframe);
  iframeMap.get(iframe)?.close();
  iframeMap.delete(iframe);
  iframeDocIds.delete(iframe);
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
    connectListeners.emit(sourceIframe);

    // Handshake succeeded: clear the timeout and any error (also covers a late connect)
    clearTimeout(iframeTimeouts.get(sourceIframe));
    iframeTimeouts.delete(sourceIframe);
    setError(sourceIframe, null);
  }
}

function handleAgentMessage(
  iframe: HTMLIFrameElement,
  event: MessageEvent<Response>,
) {
  const { id } = event.data;
  console.log("Received from agent:", event.data);
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

  agentMessageListeners.emit(iframe, event.data as unknown as Message);
}
