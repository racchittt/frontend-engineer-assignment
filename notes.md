# Notes from my build

## Commit 1: 8990161f97b32025c8e1f6ccc3b6bdf34c081546

- IFrame Document contents came out to be null >> Why? 
    - The html is being served from different origin than source (5173 vs 4001), hence facing the Cross Origin blocker
    - Read about Window.postMessage() method which is the channel both sides opt into when you control both ends of the code, provided that both of them implement it. (frontend as well as html) [Ref](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
    - The assignment is mostly the agent reading the DOM tree and reporting to the host (hover states, selection, element details). The agent watches the page and sends back the data via postMessage.

- `agent.js` needs to be added to each of the page so that it can catch events and queries, then report the DOM state. The host can't inject it because it faces the same Cross Origin wall that blocks direct DOM access.
    - This grants agent.js local access to the child's DOM. 
    - The agent acts as a middleman, gathering data locally and transmitting it back across the security border to the host via postMessage.

- Keeping the agent.js even when the pages are being served from same origin is a good idea.
    - When the page navigates, the document is destroyed and the agent re-attaches on the next load. This gives a consistent way to handle both navigation and cross-origin scenarios.
    - awaits for the pages to be loaded fully
    - modularity  as it holds element identity across re-renders in-page, whereas a same-origin host would be tightly coupled to every page's internals. 

## Commit 3: d266e630ec90c19ab0eb26e0dc125808855bb623 

- Upgraded from simple postMessage to [MessageChannel](https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel) for bidirectional communication.
    - postMessage works for one-way signals, but we need request/response pairs (query element, get children, etc).
    - MessagePort gives us a private channel per document. Each iframe gets its own port.
    - Why? Any malicious window on the page could intercept postMessage. The port is only handed to the agent we trust.

- Protocol definition in `protocol.ts` are typed message contracts both sides compile against.
    - Agent and host need to speak the same language. Defining Message and Request/Response types upfront prevents bugs.
    - This is also why we'll bundle with esbuild later, so both sides use the exact same types.

- Handshake flow: Agent says hello → Host creates MessagePort → Host sends port to agent → Both sides can now talk.
    - Host verifies the hello came from the right iframe (event.origin + event.source check).
    - Navigation destroys the old document and its port. New page loads, agent says hello again, gets a new port. No orphaned connections.

- Fetched 24 previews from `GET /screens` API.
    - Rendered them in a grid. Each iframe runs its own agent, all 24 connect on load.

- Added 10s timeout, if an agent doesn't say hello in 10s, show "Couldn't connect" error on that preview.
    - Handles cases where the page never loads or agent.js is missing.

- Tested with ping/pong. Host sends PING over the port, agent replies PONG. Verifies the connection is working.


## Commit 5: dbc3395339a1231e695fba6bb11fb92248f16b44

- Added pending request tracking with IDs and timeouts (3 seconds per request).
    - Each request gets a unique ID. The agent echoes it back in the response.
    - If no response arrives in 3s, the request times out and rejects with an error.
    - This prevents requests from hanging forever if the agent is slow or dead.

- When a page navigates, the old port dies and all its pending requests are cancelled.
    - Now: old requests reject immediately with "Navigation: page changed". New page gets a fresh start.

- PING now includes an ID so the handshake test also uses the request/response protocol.

## Commit 6: f90a95d4dbb9689e64b477a0ab3d6c2169ab5162

- Track pending requests per iframe, not globally.
    - Navigation on preview 3 was canceling preview 7's requests because the map was global.
    - Each iframe now has its own request queue. Navigation only affects that iframe.

- Query iframes dynamically in handleHandshake, not from a pre-built list.
    - Early hellos arrived before the iframes array was populated, so handleHandshake found nothing and never sent AGENT_READY.
    - Now it queries all iframes on each message, so it finds the source regardless of timing.

- Render "Couldn't connect" error overlay in UI with a retry button.
    - The 10s timeout logged to console but showed nothing to the user.
    - Added error tracking in React state, poll every 500ms, display overlay when timeout fires.

- Clean up message listener and setup timeout on unmount/hot reload.
    - Hot reloads were adding duplicate listeners without removing the old ones, causing multiple MessageChannels.
    - Return cleanup function that removes listener and clears timeout.

- Generate dynamic docId per page load instead of hardcoding.
    - Hardcoded `data-doc-id="page-1"` makes it impossible to tell navigation (new document) from reload (same page, new load).
    - Now: `${url}-${timestamp}-${random}`. Navigation creates new document with new docId.

- Agent stops retrying hello after AGENT_READY arrives.
    - Was retrying every 100ms indefinitely even after connection succeeded, spamming the console.
    - Added `connected` flag that stops the retry interval when AGENT_READY is received.


## Commit 7: 555c386cb203e6d8d8945b8e21e01e89c5983861

- "Couldn't connect" overlay never showed up, fixed.
    - The 10s timer was created in `initAgent`, but App renders "Loading..." first, so there were 0 iframes at that point.
    - Also a dead agent never says hello, so a timer started on hello can never fire.
    - Now each iframe starts its own 10s timer from its ref callback (`watchIframe`). It doesn't depend on the agent at all.
    - A late hello still clears the error.

- Host now stores the `docId` per iframe to tell a retried hello from a navigation.
    - Before, every retried hello hit the "Navigation detected" branch, closing the port and rejecting pending requests.
    - Same docId = same document retrying, ignore it. Different docId with an open port = navigation, tear down.

- Agent side guards.
    - A second AGENT_READY is ignored, the first port stays.
    - Hello gives up after 100 tries (~10s) instead of running forever.

- Replaced the 500ms polling with a subscription.
    - `agent.ts` exposes `onErrorChange`, and only notifies when an error really changes.
    - The board no longer re-renders twice a second for nothing.

- Retry button reloads only that preview.
    - It used to reload the whole host and all 24 iframes.
    - `retryIframe` closes that port, clears the error, restarts the timer and reloads that one iframe.

- Per document MessagePort is better because two way communication between each document can be established and then you can interact with each of the different docs individually rather than overloading the same agent

- Navigation doesn't wait for the 3s timeout. When the new document says hello with a different docId, teardown() rejects that iframe's pending requests immediately with "Navigation: page changed", then closes the old port.
- docId is how the host tells "same document retrying hello" (ignore) from "new document" (tear down).

## Commit 8: a5aeba1a1aec49bc966b4cd4b6d589b6f0da725f

- Added a pannable and zoomable board for the 24 previews (M3).
    - One design board `<div>` with `transform: translate(x,y) scale(z)` and `transform-origin: 0 0`. Previews sit in a 4 column grid inside it.
    - Camera is just `{ x, y, z }`, kept in React state.

- Zoom around the pointer, so the point under the cursor stays fixed.
    - Formula: `newPan = p − (p − pan) × (z′ / z)`. Lives in `camera.ts` as pure functions (`zoomAt`, `panBy`, `clampZoom`)
    - `p` is the cursor relative to the board, not the window. The header and padding would shift it otherwise.
    - Zoom is multiplicative (`Math.exp`), so zooming in then out lands back where it started.
    - Clamped to 25%–400%. (0.25, 4) `k` is computed after clamping, so the pan doesn't drift at the limits.

- Ctrl+wheel zoom needs a non-passive listener.
    - Wheel listeners are passive by default, so `preventDefault()` gets ignored and the browser zooms the whole page.
    - React's `onWheel` is passive too, so it's added with `addEventListener('wheel', ..., { passive: false })`.
    - Effect depends on `loading`, because the board div doesn't exist while "Loading..." is shown.

- Drag to pan, and the iframe trap.
    - An iframe swallows pointer events. Dragging over one sends `pointermove` and `pointerup` into the iframe, so the drag gets stuck.
    - While panning, iframes get `pointer-events: none`. It's turned off again only in `endDrag` (pointer up or cancel).
    - Also used `setPointerCapture` on the board as a backup.
    - Retry button stops `pointerdown` from bubbling, so clicking it doesn't start a pan.