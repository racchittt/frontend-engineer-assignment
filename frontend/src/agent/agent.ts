import type { Message, Request, Response } from '../protocol';

interface PendingRequest {
  id: string;
  type: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (data: any) => void;
  reject: (error: Error) => void;
}

const iframeMap = new Map<HTMLIFrameElement, MessagePort>(); // Map iframe → docId
const pendingRequests = new Map<string, PendingRequest>();
const REQUEST_TIMEOUT = 3000;
const PAGES_ORIGIN = "http://localhost:4001"; // Pages come from here
let iframes: HTMLIFrameElement[] = [];

export async function initAgent() {
  iframes = Array.from(document.querySelectorAll('iframe'));
  console.log(`Found ${iframes.length} iframes`);

  // Listen for AGENT_HELLO handshake
  window.addEventListener('message', handleHandshake);

  // Start timeout for any iframe that doesn't connect
  iframes.forEach((iframe) => {
    setTimeout(() => {
      if (!iframeMap.has(iframe)) {
        console.error('Timeout: agent not connected after 10s');
        // TODO: Show "Couldn't connect" error on that preview
      }
    }, 10000);
  });
}

function handleHandshake(event: MessageEvent<Message>) {
  if (event.origin !== PAGES_ORIGIN) return; //check if safe origin

  const sourceIframe = iframes.find((i) => i.contentWindow === event.source);
  if (!sourceIframe) return; //check if safe iframe

  if (event.data.type === 'AGENT_HELLO') {
    const docId = event.data.docId;
    console.log(`Agent said hello from ${docId}`);

    const oldPort = iframeMap.get(sourceIframe);
    if (oldPort) {
      console.log(`Navigation detected on ${docId}. Canceling pending requests.`);
      // Find all requests from this iframe and reject them
      pendingRequests.forEach((req, id) => {
        if (req.type !== 'ORPHANED') { // Mark as orphaned
          clearTimeout(req.timeout);
          req.reject(new Error('Navigation: page changed'));
          pendingRequests.delete(id);
        }
      });
      oldPort.close();
    }
    // Create MessageChannel for this iframe
    const channel = new MessageChannel();
    iframeMap.set(sourceIframe, channel.port1);

    // Send the other port to the agent
    sourceIframe.contentWindow?.postMessage(
      { type: 'AGENT_READY', port: channel.port2 },
      PAGES_ORIGIN,
      [channel.port2]
    );

    // Listen on our port
    channel.port1.onmessage = (portEvent) => handleAgentMessage(sourceIframe, portEvent);
    channel.port1.start();

    // Test: send ping with ID
    const pingId = `ping-${Date.now()}`;
    channel.port1.postMessage({ id: pingId, type: 'PING' });
  }
}


function handleAgentMessage(iframe: HTMLIFrameElement, event: MessageEvent) {
  const { id, type } = event.data;
  console.log('Received from agent:', event.data);

  if (id) {
    // This is a response to a request
    const pending = pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(event.data);
      pendingRequests.delete(id);
    }
  }

  if (event.data.type === 'PONG') {
    console.log('✓ Ping-pong successful');
  }
}

export function sendToAgent(iframe: HTMLIFrameElement, message: Request) {
  const port = iframeMap.get(iframe);
  if (port) {
    port.postMessage(message);
  } else {
    console.error('Agent not connected for this iframe');
  }
}

export async function queryAgent(
  iframe: HTMLIFrameElement,
  type: string,
  payload: any
): Promise<any> {
  const port = iframeMap.get(iframe);
  if (!port) throw new Error('Agent not connected');

  const id = `${Date.now()}-${Math.random()}`;
  const request = { id, type, ...payload };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request timeout: ${type}`));
    }, REQUEST_TIMEOUT);

    pendingRequests.set(id, { id, type, timeout, resolve, reject });
    port.postMessage(request);
  });
}