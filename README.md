# Design-tool viewer: cross-origin preview inspector

A board of 24 live `<iframe>` previews. The app ("host") runs on `:5173` and the pages run on `:4001`, a different origin. The host draws hover and selection outlines on top of the previews, and has a lazily loaded layers panel, an inspector, and isolated per-region failure handling.

The original assignment is in [docs/ASSIGNMENT.md](docs/ASSIGNMENT.md).

Stack: React 19, TypeScript, Vite, Tailwind. The agent inside each page is plain JavaScript (`backend/pages/agent.js`). No state library.

## Run it

```
# installs `concurrently` and postinstall adds frontend deps too
npm install && npm run dev 
```

| What | URL |
|---|---|
| Host app (Vite) | http://localhost:5173 |
| Mock API | http://localhost:4000 |
| Preview pages | http://localhost:4001 |

- The only change to the pages is one `<script src="agent.js">` tag in each. 
- `agent.js` is hand-written and committed. There is no build step for it.
- The **Dev failures** button (top bar, dev build only) triggers each failure from R6.7.

## How it is put together

The host cannot read a cross-origin DOM (`iframe.contentDocument` is `null`). So the one script tag in each page is an **agent** that reads the page for the host.

### The agent (agent.js) knows facts about the DOM 
  - what element is under the pointer, its rect, its children, its styles. 

### The host owns the interaction state
  - Which mode (select/interact), 
  - Where to hover, 
  - Which element to select, 
  - Currently active preview, 
  - expanded rows of selected preview 
  - Decides what to do with it from the UI.

```
Host (:5173)                                         Page (:4001) x 24
┌──────────────────────────────────────┐            ┌─────────────────────────────┐
│ Board: camera, CSS transform         │            │ agent.js                    │
│ Outline layer (screen space)         │◄── port ──►│  element ids, identity      │
│ Layers panel (virtualised)           │            │  select-mode gate           │
│ Inspector (Live + Details)           │            │  hit testing, rect tracking │
│ Regions: failure state and reporting │            │  MutationObserver           │
└──────────────────────────────────────┘            └─────────────────────────────┘
```
## Repository code structure
```
frontend/src/
  protocol.ts          every message type, both directions
  camera.ts            pan and zoom maths
  regions.ts           failure state, fail / retry / guard
  agent/               host-side code that talks to the agents
    connection.ts      handshake, one MessageChannel per preview, requests with timeouts
    overlay.ts         mode, hover, selection, active preview
    tree.ts            layers tree model: lazy loading, reveal, search, live updates
    keys.ts            one key handler for host keys and keys forwarded from a page
  ui/                  board, outline layer, layers panel, inspector, toolbar
  dev/                 dev-only failure menu
backend/pages/agent.js the in-page agent
```

## Ambiguities
1. **Errors inside a page**. Shown as the "Page error" badge, and also sent to `report()`, once per distinct message per page load, as `{region: "preview", screenId}`. The preview itself keeps working, so it is a badge and not a region error.
2. **A row load that answers after the 3s timeout.** The reply is dropped and the row stays on "Couldn't load" until the user presses that row's Retry. It's because letting a late answer clear an error would make the UI flicker and would violate the "exactly once" requirement.
3. **What a name is.** `data-name`, else `tag.firstClass`, else `tag#id`, else the tag. `data-key` is not part of a name. Page 4's rows are all called `li` because picking data-key resulted in the element have no name.
4. **`<script>` is in layers tree**: Requirement says every element except `html` and `body` should be in the tree.
5. **"Out of view".** An element is out of view when it is clipped by the preview edge or by a scrolling ancestor inside the page (page 3's table). The outline is clipped to the visible part, and an element with no visible part has no outline but stays selected.
6. **Clicking the page background** clears the selection and makes that preview the active one. Shift+click on the background leaves the selection alone.
7. **Interact mode.** Outlines are hidden and the page owns the keyboard. Only V and I (and Esc) are forwarded from a page, and V/I are ignored while the focus is in an input, so typing "i" never switches mode.
8. **Tab and Enter** are taken over only in Select mode and only when exactly one element is selected. Otherwise they keep their normal browser behaviour. Focused host buttons and links keep Enter and Tab too.


## How state is organised

There is no state library. Each concern has one module that owns it, exports readers, and is the only place that changes it. React reads through subscriptions (`useSyncExternalStore` or a listener that bumps a counter).

| State | Lives in | Who changes it |
|---|---|---|
| Mode (select / interact) | `agent/overlay.ts` | the toolbar and the V / I keys, via `setMode` |
| Hover (one for the whole board), selection, active preview | `agent/overlay.ts` | agent messages (`HOVER`, `SELECT`, `GONE`, `RECT_UPDATE`) and layers rows, all through `select()` |
| Camera `{x, y, z}` | `ui/board/Board.tsx` | board pointer and wheel handlers, the zoom buttons, and forwarded Ctrl+wheel |
| Tree: nodes, expanded, children, status, per preview | `agent/tree.ts` | user actions (expand, collapse, retry), `reveal`, and `CHILDREN_CHANGED` from the agent |
| Connection: port, pending requests, timers | `agent/connection.ts` | handshake, `queryAgent`, teardown |
| Failures: attempt counter and error per region | `regions.ts` | `fail`, `retry`, `clear` only |
| Layers scroll position per preview | `ui/layers/LayersPanel.tsx`  | the panel |
| Search text, keyboard cursor row | `ui/layers/LayersPanel.tsx`  | the panel |


## How the host and the pages talk

All message types are in [`frontend/src/protocol.ts`](frontend/src/protocol.ts).

### Handshake

1. The agent posts `AGENT_HELLO {docId}` to `window.parent`, with the host origin as `targetOrigin`. It repeats every 100ms until it gets an answer. `docId` is new for every document.
2. The host checks `event.origin` and that `event.source` is one of its iframes' windows. It creates a `MessageChannel` and replies `AGENT_READY`, transferring one port. After that everything travels on that private port
3. A hello with the **same** `docId` is a retry and is ignored. A hello with a **new** `docId` from the same iframe is a navigation: the host tears down that preview's state and port and starts again.

### Messages

| Direction | Message | Meaning |
|---|---|---|
| host → agent | `SET_MODE` | select or interact |
| | `TRACK`, `KEEP` | follow these elements (the selection, the open rows) across re-renders |
| | `HOVER_NODE` | a layers row is hovered: outline its element |
| | `SCROLL_TO` | a row was clicked: scroll the page to show the element |
| agent → host | `HOVER`, `SELECT`, `BACKGROUND` | what the pointer is over or clicked |
| | `RECT_UPDATE`, `GONE` | rect changes, elements that could not be found again |
| | `CHILDREN_CHANGED` | these parents got new children |
| | `KEY` | a shortcut key typed inside the page (keys never reach the host) |
| | `ZOOM_WHEEL` | Ctrl/Cmd+wheel over the page (the browser would otherwise zoom the whole host) |
| | `PAGE_ERROR` | the page threw or rejected |
| host → agent, with a reply | `GET_CHILDREN`, `REVEAL`, `SEARCH`, `NAVIGATE`, `INSPECT` | a request with an id; the reply responds back with it |

### **Slow, gone, or replaced**
- **Slow.** Every request has a 3s timeout and a preview has 10s to connect. A timed-out request rejects and is removed, so a late reply finds nothing waiting and is ignored.
- **Gone / replaced.** On navigation or Retry, the host rejects that preview's waiting requests with a `Cancelled` error. Late replies for the old page are dropped.
### Element identity across re-renders

The agent gives every element an id (a `WeakMap` from node to id). For each selected element it takes a fingerprint while the element is alive: the nearest `data-key`, the path under it, and a signature (tag, text, attributes).

### The layers tree

- `GET_CHILDREN` loads a row's children when it is first opened. There is at most one request in flight per node, and a reply **replaces** the child list, never appends. Collapsing and re-expanding during a load cannot duplicate children.
- `REVEAL` returns every ancestor level of an element, each with all of its children, in one reply. 
- The list is virtualised and the agent watches the DOM and sends `CHILDREN_CHANGED`. 
- The host reloads only the open parents and replaces their children. Rows that still exist keep their expanded state.

### How failures are contained

- `fail(region, error, at)` shows the error and calls `report()` once. `at` is the attempt the work started in. If the region was retried since, the result is for a question nobody is asking any more and is ignored.
- `retry(region)` bumps the attempt and clears the error, so a retry that fails again is a new failure and is reported again.
- Cancelled and aborted requests are ignored by `fail`. Useful for the Details request which is aborted on every selection change and serving old details for another component would be incorrect.
- `guard(region, fn)` wraps handlers, timers, message listeners and promise continuations. A throw or a rejection fails the region instead of being lost. 

## Where this breaks

- **No guards in the agent.** The agent does not check who sends it `AGENT_READY` or limit its hello retries. Any window that can reach the iframe could send one.
- **Unkeyed elements after a rebuild.** An unkeyed element whose text changed by more than digits is dropped from the selection, never moved. 
- **Digit masking** can match the wrong element if exactly one unkeyed element is removed and one with the same masked text is added (Page 4's list updates, seconds ago changes with every 2 seconds.).
- **Layers Retry** loses the search text and the keyboard cursor row, and does not reveal the selection again until the next selection
- **Search** results don't refresh with DOM updates
- **24 live iframes** are always mounted. There is no virtualisation of previews.
- **No automated tests.** `agent.js` is not typed against `protocol.ts`, so the two are kept in step by hand.

## What I would do with another week

- Bundle the agent from TypeScript and share `protocol.ts` with the host, so the message types cannot drift.
- Put origins and timeouts in one config module.
- Add unit tests for identity and the regions store, and a small Playwright suite.
- Add state management using Zustand/Redux for tracking mutations and updates better. The current version works because of minimal component, but will spiral into a mess when amount of component increases

## How I used AI
- Based on my understanding from the requirements, drew a mockup and formed initial hypothesis about how the system should work. 
- Gave this plan doc and design to claude code for vetting
- Hardened the results and asked it to fill in any edge cases which i may have missed.
- Created a phased plan with Claude which allowed for iterative building.
- Implemented the foundation work (protocol, message types, connection) and asked Claude to vet it for me.
- Bugs its reviews found in my code, which I then fixed or asked claude to fix based on the complexity.
- Verified the output and change diffs before commiting.
- Asked Claude to refactor the code once majority of the task was done to remove redundant code and improve readability.
- Gave it a mockup wireframe (from excalidraw) and asked it to modernize/enhance the UI from plain, uncolored wireframe which i built out.

### Where ai was wrong
- **A feature it wrote caused a new bug.** it added Shift+click on layer rows. In a live check the shift-click also highlighted the row text in blue. It was fixed with `select-none` on the rows. 
- **Wrong assumptions**: It first thought `onAgentMessage` returned the listener `Set` and not an unsubscribe function, which would have broken the Board's cleanup.