console.log("Agent loading...");

(function() {
  // Generate unique docId for this page load
  // Navigation creates a new document with a new docId
  const docId = `${window.location.href}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const HOST_ORIGIN = 'http://localhost:5173';
  let agentPort = null;
  let helloInterval = null;
  let connected = false;

  // Retry hello until AGENT_READY arrives
  function sayHello() {
    if (!connected && window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: 'AGENT_HELLO', docId },
        HOST_ORIGIN
      );
      console.log(`[${docId}] Sent AGENT_HELLO`);
    }
  }

  // Say hello immediately
  // sayHello();

  // Retry every 100ms until we get AGENT_READY
  helloInterval = setInterval(sayHello, 100);

  // Listen for AGENT_READY from host
  window.addEventListener('message', (event) => {
    console.log(`[${docId}] Received message:`, event.data.type, 'from origin:', event.origin);

    if (event.origin !== HOST_ORIGIN) {
      console.warn(`[${docId}] Rejected: untrusted origin ${event.origin}, expected ${HOST_ORIGIN}`);
      return;
    }

    if (event.data.type === 'AGENT_READY') {
      console.log(`[${docId}] AGENT_READY received, ports:`, event.ports.length);
      if (event.ports[0]) {
        connected = true;
        clearInterval(helloInterval);
        console.log(`[${docId}] Cleared hello interval, connected = true`);
        agentPort = event.ports[0];
        agentPort.onmessage = handlePortMessage;
        agentPort.start();
        console.log(`[${docId}] Got MessagePort, ready to communicate`);
      }
    }
  });

  // ping-pong 
  function handlePortMessage(event) {
    const { id, type } = event.data;
    console.log(`[${docId}] Received:`, type);

    if (type === 'PING') {
      agentPort.postMessage({ id, type: 'PONG' });
      console.log(`[${docId}] Sent PONG`);
    }

    if (type === 'QUERY_ELEMENT') {
    const element = document.querySelector(`[data-key="${event.data.elementKey}"]`);
    agentPort.postMessage({
      id, // Echo the ID back
      type: 'ELEMENT_DATA',
      data: { /* ... */ }
    });
  }
  }

  window.agentPort = agentPort; // for debugging
})(); 