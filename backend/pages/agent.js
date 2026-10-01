console.log("Agent loading...");

(function() {
  const currentScript = document.currentScript;
  const docId = currentScript ? currentScript.getAttribute('data-doc-id') : Date.now().toString();

  const HOST_ORIGIN = 'http://localhost:5173';
  let agentPort = null;
  let helloInterval = null;

  // Retry hello until AGENT_READY arrives
  function sayHello() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: 'AGENT_HELLO', docId },
        HOST_ORIGIN
      );
      console.log(`[${docId}] Sent AGENT_HELLO`);
    }
  }

  // Say hello immediately
  sayHello();

  // Retry every 100ms until we get AGENT_READY
  helloInterval = setInterval(sayHello, 100);

  // Listen for AGENT_READY from host
  window.addEventListener('message', (event) => {
    if (event.origin !== HOST_ORIGIN) {
      console.warn('Rejected: untrusted origin', event.origin);
      return;
    }

    if (event.data.type === 'AGENT_READY' && event.ports[0]) {
      clearInterval(helloInterval);
      agentPort = event.ports[0];
      agentPort.onmessage = handlePortMessage;
      agentPort.start();
      console.log(`[${docId}] Got MessagePort, ready to communicate`);
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