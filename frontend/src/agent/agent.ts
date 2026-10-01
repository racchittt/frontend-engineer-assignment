import type { Message, Request, Response } from '../protocol';

const iframeMap = new Map<HTMLIFrameElement, MessagePort>(); // Map iframe → docId
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

    // Test: send ping
    channel.port1.postMessage({ type: 'PING' });
  }
}


function handleAgentMessage(iframe: HTMLIFrameElement, event: MessageEvent) {
  console.log('Received from agent:', event.data);

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