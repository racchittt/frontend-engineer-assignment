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

## Commit 9: 

- Select mode blocks the page from inside the page, not with a shield over the iframe.
    - The agent adds capture phase listeners on `window` (pointerdown, mousedown, click, focusin, submit, keydown...). They call `stopImmediatePropagation` and `preventDefault` before the page's own handlers run.
    - A shield div over the iframe would also block hover, wheel scroll and `elementFromPoint`.
    - `preventDefault` on `mousedown` is what stops an input from getting focus.
    - Gate listeners are registered once at the top. Mode lives in one variable. Interact mode just returns early.
    - Bug I hit: I first put them inside the port message handler, so every message added more listeners and reset the mode.

- Selection uses `pointerup`, not `click`.
    - Disabled buttons never fire `click`, so page 2's disabled button could not be selected.

- Hover and select messages go over the port.
    - Agent sends `HOVER {box}` only when the element under the pointer changes, and `SELECT {box, shift}` on pointerup.
    - Every element gets an id from a `WeakMap`. Not every element has `data-key`, and the README says any element can be selected.
    - Boxes are plain `{id, label, x, y, w, h}` objects. Not `DOMRect`.
    - Host keeps hover and selection per iframe. Shift + click toggles in the same preview. A plain click, or shift in a different preview, replaces the selection everywhere.
    - Host sends the current mode (`SET_MODE`) after every handshake, so a preview that reconnects does not fall back to select mode.

- Overlay is a separate layer outside the scaled board.
    - Outline borders are fixed 1px (hover) and 2px (selected), so they stay thin at 400% zoom.
    - Page to screen coordinates: `iframe.getBoundingClientRect()` already includes pan and zoom. Scale is `rect.width / offsetWidth`. Box position is `rect.left + box.x * scale`.
    - Each preview gets its own clipping group, so outlines are cut at the preview's edge.
    - Used `clientLeft`/`clientWidth` for the iframe, so its 1px border does not shift outlines.
    - Conversion runs in a layout effect, so it re-runs when the camera moves.

- Outlines stay glued when the page scrolls.
    - Scroll events do not bubble. A normal listener on `window` never hears page 3's `.scroll-area`. A capture listener does.
    - Agent re-sends rects on scroll and resize, throttled to one per animation frame.
    - Host tells the agent which ids are selected (`TRACK`), so the agent knows what to re-measure. Host merges new rects by id

- Outlines are clipped against scroll containers.
    - `getBoundingClientRect` ignores clipping, so a row scrolled out of the table kept a box floating over other content.
    - `visibleRect` intersects the box with every ancestor whose overflow is not `visible`, using the padding box (no border or scrollbar), then with the iframe viewport.
    - Fully hidden elements send a zero size box. They stay selected, the host just does not draw them.
    - Limit: `position: absolute` elements whose containing block is outside the scroll container are still clipped by this code. `position: fixed` is skipped on purpose.

## Commit 10: 

- Selection now survives page 4 re-rendering.
    - Page 4 rebuilds the whole list every 2 seconds. Every row is a new element, so the old selected element is gone.
    - Before, the box just froze in place. Now the agent finds the new copy of the same row, or drops the selection.
- How the agent finds the same row again (in `agent.js`).
    - When a row is selected, the agent saves a small description of it: its key, its place inside that key, and its text.
    - A `MutationObserver` tells the agent when elements are added or removed.
    - If the row has a `data-key`, look for the new element with the same key. Exactly one match, keep it.
    - If it has no key, look for exactly one new element with the same tag, text and attributes.
    - If we are not sure, drop the selection. Never move it to a neighbour.
- Why drop instead of guess.
    - Moving the box to the wrong row looks like it worked, but the user now has the wrong thing selected.
    - A dropped selection is easy to see and easy to fix by clicking again.
    - Unkeyed rows on page 4 always get dropped, because their "2s ago" text changes every render.
- Why not use the position, like `li:nth-child(2)`.
    - Page 4 adds new rows at the top, so every row moves down one place.
    - The position would then point at a different row. That is a silent jump.
    - Position is only used inside a keyed row, where it cannot move.
- New message `GONE`.
    - The agent sends it when it drops a selection. The host removes that box.
- Renamed `agent.ts` to `host-bridge.ts`.
    - `agent.js` runs inside each preview page. `agent.ts` runs in the host app. Both had the same name, which was confusing.
    - `agent.js` keeps its name because all 24 pages load it.


## Commit 11: 

- Keyboard control: V, I, Esc, Enter, Shift+Enter, Tab.
    - V selects Select mode, I selects Interact mode.
    - Esc clears the selection.
    - Enter goes to the first child, Shift+Enter to the parent, Tab to the next sibling, Shift+Tab to the previous one.
    - Enter and Tab only work in Select mode. In Interact mode they act like normal keys.
- Keys typed inside a preview.
    - The preview is a different page, so the host never sees those keys.
    - The agent catches the key and sends it to the host as a `KEY` message.
    - The host has one function, `handleKey`, used for its own keys and for keys sent by the agent.
    - One key press only happens in one place, so nothing is handled twice.
    - This listener must be added before the block listener in `agent.js`, or the block listener stops it first.
- Typing in a text box.
    - The agent checks what is focused. If it is an input, textarea, select or editable text, it does not send the key.
    - So typing "i" in an input just types the letter.
    - Esc is the only key sent from a text box.
- Enter and Tab need the page, so they use a request.
    - The host calls `queryAgent` with `NAVIGATE` and a direction.
    - The agent finds the element, takes the child, parent or sibling, and sends back its box with the same id.
    - If there is no such element, nothing changes. If the request times out, the selection stays.
    - It only works when exactly one element is selected.
- Fixes.
    - Keys with Ctrl, Cmd or Alt are ignored on both sides, so Ctrl+V or Ctrl+Shift+I do not change the mode.
    - Enter and Tab are ignored when a host button or link is focused, so the toolbar and Retry still work with the keyboard.
    - A Tab reply is dropped if the selection changed while waiting. So Esc right after Tab stays cleared.
    - Pressing Tab twice very fast can move only one step. Left as is.
- Explain it back. 
    - A key typed inside a preview goes to the preview page only. The host never gets it, so the agent forwards it as `KEY`.
    - If both handled `v`, the mode would be set twice and a selection could be cleared or moved twice.
    - It cannot happen here: one key press goes to one page, and only the host acts on it.

### Why a request is needed
- The host only knows about boxes: numbers like {id: "e7", x, y, w, h}. It can't see the page's DOM, because the page is in a different origin. "The child of this element" is a DOM question, so only the agent inside the page can answer it. The host has to ask and wait for the reply. This is a request and a response over the MessagePort, not a one-way message like HOVER.

Example: select a card, press Enter

1. You press Enter (host in Select mode, or forwarded from the preview as KEY). handleKey("Enter", false) runs, then navigate.
2. The host picks the starting point. It finds the preview that has exactly one selected box and reads that box's id, say e7. Enter becomes dir = "child". Shift+Enter becomes "parent", Tab "next", Shift+Tab "prev".
3. The host sends the request with queryAgent(iframe, "NAVIGATE", { from: "e7", dir: "child" }). queryAgent adds a random request id, stores a pending promise, and starts a 3 second timer.
4. The agent receives it. It looks up e7 in byId to get the real element. Then it picks the target: firstElementChild for child, parentElement for parent, nextElementSibling or previousElementSibling for the others.
5. The agent replies with { id, type: "NAVIGATED", box }. boxOf(target) gives the new box and assigns a fresh id like e12 if the element has never been seen. The id in the reply is the same request id the host sent.
6. The host matches the reply. handleAgentMessage sees an id, finds the pending request, and resolves the promise. The .then sets the selection to the new box, sends TRACK [e12] so the agent follows it, and redraws.

## Commit 12: 

- Layers panel: a tree of each preview's elements.
    - The page's DOM is in the agent, so the host asks for it with requests. It does not get the whole tree at once.
    - Children load only when a row is expanded (`GET_CHILDREN`). The agent sends back `{id, label, hasChildren}` for each child.
    - No id in the request means the top: the reply is `<html>`. An id of an element that is gone gets `null`, so the row shows an error and not the wrong rows.
- Where the tree state lives (`tree.ts`).
    - One map per preview, by element id. Each node has `children` (ids), `expanded` and `status` (idle, loading, error).
    - The tree is changed in place, so React is told with a subscription (`onTreeChange`) and the panel re-renders.
    - A node's children are replaced when the reply arrives, never added to.
    - Only one request per node can be running. Expanding a loading node does nothing new.
    - So collapse and expand while loading cannot make duplicate rows.
    - A timeout only marks that row as error, with a Retry. The rest of the tree keeps working.
- Many rows: only the rows on screen are drawn.
    - The visible rows are put in one flat list. Every row is 24px high, so the first and last row to draw come from the scroll position.
    - A tall empty box gives the scrollbar its real size. Each row is placed at its index times 24.
- Reveal: select something in a preview and its row opens in the tree.
    - Page 5 is 30 levels deep. 30 requests could each time out, so the agent answers once (`REVEAL`) with every level from `<html>` down.
    - The host fills the levels from the top, opens each one, then scrolls to the row (up and sideways, because 30 levels of indent is wider than the panel).
    - The selected row is orange. The hovered row is blue.
    - If a node is still loading when reveal arrives, reveal leaves it as loading. Its own reply sets it to idle. Setting idle early would hide the spinner and allow a second request.
- Hover in both directions.
    - Preview to row: the row whose id matches the hover box turns blue.
    - Row to preview: the host sends `HOVER_NODE`. The agent answers with the normal `HOVER` message, so the outline, scrolling and re-render handling are the same as a real hover.
    - A hovered element inside a closed row has no row to light up, and hover never opens rows.
- Page navigation: the tree is cleared for that preview.
    - `teardown` already runs on navigation and on Retry. It now calls `onIframeReset`, and `tree.ts` drops that preview's map.
    - It is a subscription and not an import, because `tree.ts` already imports `host-bridge.ts`.
- Keyboard in the panel.
    - Up, Down, Home, End move the cursor. Right opens a row or goes to its first child. Left closes it or goes to its parent. Enter or Space selects the element.
    - The tree is one focusable box with a cursor row. It does not give each row focus, because rows come and go while scrolling.
    - The panel stops the keys it uses. App's Enter and Tab are ignored inside the tree, or Tab would trap the focus.
    - Clicking a row selects the element too. The arrow only opens and closes.
- Search.
    - Most of the DOM is never loaded in the tree, so the agent searches its whole page (`SEARCH`). It matches the label and class names, and sends back the first 50 and the total.
    - All previews are asked. A preview that fails only adds nothing.
    - Typing waits 250ms. A counter drops an old reply that arrives after a newer one.
    - Picking a result selects the element, clears the box, and reveal opens the tree there.
- Inspector (right side).
    - One element: the Live values come from the agent (`INSPECT`): name, tag, id, classes, size, position in the page, text (120 characters), colours and font.
    - It asks again when the selection or its boxes change. A hover alone does not change them, so it causes no requests.
    - Each reply is tied to the selection it was asked for, so a late reply is never shown.
    - Details come from `GET /elements/:key` in a separate part. A newer selection cancels the old fetch.
    - No `data-key` shows "No details". A 404 shows "No details for this element" and is not an error. Other failures show a Retry in that part only.
    - Several elements: "N elements", and each field is the shared value or "Mixed". No Details.
    - If the page removes the selected elements, it says "This element no longer exists". Esc does not.
- Refactor.
    - The select logic moved from the `SELECT` handler into one `select()` function. Clicks in a preview and clicks on a row both use it.
    - `NAVIGATE` got a `self` direction, so a row click gets the element's box the same way Tab does.


## Commit 13: 

- Active preview: the layers panel shows one preview, the one last picked in Select mode.
    - It is set inside `select()`, so a click in a preview, a click on a row, a search pick and Enter on a row all count.
    - It stays after Esc and after the page navigates. Before any click the panel says "Click something in a preview".
    - It is kept in `host-bridge.ts` (`getActiveIframe`) next to the selection, and the panel re-renders on the same overlay event.
- The top rows are the children of `<body>`.
    - `html` and `body` are not elements in the tree. This changes the agent: `GET_CHILDREN` with no id, `REVEAL` and `SEARCH` all start at `<body>`.
    - `NAVIGATE` also stops at the top, so Shift+Enter on a top row does nothing. This was a gap in the keyboard work.
    - The hidden root is still in the map. `flatten` skips it and starts at its children.
    - The top level loads when a preview becomes active. After a page navigates the map is cleared, so the root is fresh and loads again.
    - If the top level fails, the panel shows "Couldn't load" with a Retry.
- Switching between previews.
    - Expanded rows are remembered for free, because the tree map is already one per preview. It is only cleared on navigation or reload.
    - Scroll position is saved per preview and put back when the preview becomes active again.
    - Checked with two previews: Sign up showed its own tree, and going back to Landing showed it still open.
- Search now covers the active preview only, and results do not show a screen name. The panel does not need the screens list any more.
- Error rows now say "Couldn't load" with a Retry.


## Commit 14: 

- Refactor
    - `host-bridge.ts` is split into 
        - `agent/connection.ts` (ports, handshake, requests), 
        - `agent/overlay.ts` (mode, hover, selection) and 
        - `agent/keys.ts` (shortcuts). 
        - Imports go one way: `connection` <- `overlay` <- `keys`. `connection` knows nothing about the overlay, it only offers subscriptions (`onAgentMessage`, `onIframeConnect`, `onIframeReset`, `onErrorChange`).
    - `protocol.ts` holds every message. `Message` is the one-way union. `Requests` maps each request (NAVIGATE, GET_CHILDREN, REVEAL, SEARCH, INSPECT) to its payload and reply, so `queryAgent` is typed both ways.
    - App is split into `ui/board`, `ui/layers` and `ui/inspector`. The layers panel is a row, a search box and some hooks. The inspector is sections.
    - `agent.js` is one classic script (24 pages load it with a plain `<script>`), so it stays in one file. It is now in sections (state, elements, keys, select gate, identity, rects, pointer, requests, connection), and requests go through a handler table.
- Restyle. Every component got the same look: slate and white, a purple selection (`#ad46ff`), a blue hover, theme tokens in `index.css`. Row height is 26px now.
- Zoom control: minus, plus and the percentage on the board. It uses the same camera as Ctrl+wheel.
- Hover shows its ancestors.
    - The agent sends the ids of the hovered element's ancestors with `HOVER`.
    - If the hovered element has no row (its parent is closed), the nearest open ancestor's row turns blue.
- The layers panel follows the page.
    - The agent watches the DOM and sends `CHILDREN_CHANGED` (after 100ms) with the parents that changed.
    - The host re-reads only the parents that are open and replaces their children. Rows that are still there keep their open state.
    - The agent follows the open rows too (`KEEP`), the same way it follows the selection, so an open row survives a re-render.
    - If a parent's load is running when the change arrives, it is marked dirty and read again when it lands.
- Page 4 (activity feed): names are the same for every row (`li`), not `activity-##` for half of them. The name rule is from the README: `data-name`, else `tag.firstClass`, else `tag#id`, else the tag. `data-key` is not part of a name.
- Page background.
    - `html` and `body` are not elements, so hovering the background shows nothing and clicking it clears the selection (`BACKGROUND`). Shift+click leaves the selection alone.
    - The board is `select-none`. Dragging to pan was selecting the text of the previews and flashing blue.
- Selection across re-renders, for elements with no `data-key` (page 4, even rows).
    - They were matched by their exact text, and "Ns ago" changes on every render, so they were dropped.
    - Now: exact text first, then the same text with digits ignored. It must still be one-to-one.
    - Spans inside a row ("10s ago", the avatar) look the same in every row. The agent keeps the element's ancestors too, finds the nearest ancestor that is unique (the `li`), and walks down by position.
    - Two identical candidates are still dropped. It does not guess.


## Commit 15: 

- #### Failures (R6). One broken part shows an error with a Retry in its own region, and the rest keeps working. `report()` from `frontend/report.js` is used as it is. A small `report.d.ts` gives it types.
- Regions (`regions.ts`).
    - A region is the board, one preview, the layers panel, one row's child loading, the inspector, or its Details section. Each one has an attempt counter and at most one error showing.
    - `fail(scope, error, at)` shows the error and calls `report()` once. If an error is already showing for that region, a second one is dropped. That is the "exactly once".
    - `retry(scope)` starts a new attempt and clears the error. So a retry that fails again is a new failure and reports again.
    - `at` is the attempt the work started in. A failure from an old attempt is ignored, so a late answer after a retry changes nothing and reports nothing.
    - Previews and rows have one region per screen (and row). The others have one region each. `screenId` there is only for `report()`.
- What is not a failure.
    - A request that was cancelled or replaced is a `Cancelled` error or an `AbortError`. `fail` ignores both: nothing is shown, nothing is reported.
    - The Details `AbortController` fires on every selection change, so without this rule every click would show a false error.
    - `teardown` (navigation or Retry) rejects waiting requests with `Cancelled`. A reply that lands after the page was replaced is dropped (the row is checked to still be in the tree).
- Where errors are caught.
    - Drawing: `RegionBoundary`, a class (React only has class boundaries). It does not see async errors, so those go through `fail` or `guard`.
    - `guard(scope, fn)` wraps handlers, timers, listeners and promise continuations. A throw or a rejection fails the region instead of getting lost. It is used on the layers click and keys, the shortcuts, the search timer, and the messages from a preview.
    - A listener that throws in the connection layer fails that preview's region and does not stop the other listeners.
- Each region.
    - Board: `GET /screens` failing, or bad data, shows the error in the board area. Retry loads the screens again.
    - Preview: no hello in 10 seconds shows "Couldn't connect to this preview" on that preview. The iframe stays under it, so a late connect clears the error. Retry reloads only that iframe.
    - Layers panel: render errors and failed handlers replace the panel with the error. Search failing also lands here, unless the user typed past it.
    - Row: a failed `GET_CHILDREN` marks that row "Couldn't load" with a Retry, and nothing else. The top level counts as a row too.
    - Inspector: a render error, or the live values request failing, shows the error. The board and the layers panel keep working.
    - Details: its own fetch, with the error shown for the current element only. Live values above it keep showing. A new element clears the old error.
- Errors inside a page: the agent sends `PAGE_ERROR` for an uncaught error or rejection. The preview gets a small "Page error" badge, and hovering shows the message. The preview still works, so nothing is covered. Each different message is reported once per page load. Page 6 does this after 4 seconds, and 4 screens use it.
- Dev menu (R6.7), only with `import.meta.env.DEV`.
    - One button per failure: screens, a preview that never connects, layers and inspector render errors, a row, live values, Details failing, Details with bad data.
    - A "throw in" list for a click, the next key, the next preview message, a timer and a response, in the region picked.
    - A fault stays on until "Clear all faults", so Retry fails again and shows as a new report.
- Bugs found while checking.
    - The region id had `screenId` in it for every kind. The inspector and Details recorded errors under one id and the screen watched another, so they never showed. Now only previews and rows have it.
    - The layers panel took a snapshot of the iframes when it mounted. After the board's Retry rebuilt them, the panel went blank. It now asks the connection for the screen of the active iframe.
    - A Retry has to remount the children, or React skips them as unchanged. Previews are the exception, so their iframe is not rebuilt.
- Not done: after Retry on the layers panel the search text and cursor row are lost, and the selected row is not revealed again until the next selection.
