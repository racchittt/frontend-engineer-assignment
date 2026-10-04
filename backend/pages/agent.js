console.log("Agent loading...");

// The agent runs inside every preview page. The host (the app on :5173) can't touch the
// page's DOM from another origin, so this script reads the page for it and talks to the
// host over a MessageChannel. Message shapes: frontend/src/protocol.ts (keep in step by hand).
//
// Sections: state, elements, shortcut keys, select-mode gate, identity across re-renders,
// rects, pointer, requests from the host, connection.
(function () {
  // ---- state ----
  // Unique id for this page load. Navigation creates a new document with a new docId.
  const docId = `${window.location.href}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const HOST_ORIGIN = "http://localhost:5173";

  let agentPort = null; // the host's end of the channel, once connected
  let mode = "select";
  let tracked = new Set(); // ids of the elements the host wants followed (the selection)
  let lastHover = null; // the element currently outlined as hovered

  const ids = new WeakMap(); // element -> id, assigned the first time we see it
  const byId = new Map(); // id -> element, for reverse lookup
  let nextId = 0;

  // ---- elements: ids, names, and what the host asks to know about one ----
  const idOf = (el) => {
    if (!ids.has(el)) {
      const id = `e${++nextId}`;
      ids.set(el, id);
      byId.set(id, new WeakRef(el));
    }
    return ids.get(el);
  };

  const labelOf = (el) =>
    el.dataset?.name ||
    el.dataset?.key ||
    el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "");

  // an element as a layers row
  const rowOf = (el) => ({
    id: idOf(el),
    label: labelOf(el),
    hasChildren: el.childElementCount > 0,
  });

  // what the inspector's Live section shows. All strings, so the host can compare
  // several elements field by field ("Mixed" when they differ).
  const liveOf = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      name: labelOf(el),
      tag: el.tagName.toLowerCase(),
      id: el.id,
      classes: el.getAttribute("class") ?? "",
      size: `${Math.round(r.width)} × ${Math.round(r.height)}`,
      // position within the page: viewport position plus how far the page is scrolled
      position: `${Math.round(r.left + window.scrollX)}, ${Math.round(r.top + window.scrollY)}`,
      text: el.textContent.replace(/\s+/g, " ").trim().slice(0, 120),
      color: cs.color,
      background: cs.backgroundColor,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      key: el.dataset?.key ?? null, // for GET /elements/:key, not shown as a field
    };
  };

  // the part of the element that is actually visible: clipped by scrolling ancestors and the page
  function visibleRect(el) {
    const r = el.getBoundingClientRect();
    let left = r.left,
      top = r.top,
      right = r.right,
      bottom = r.bottom;

    if (getComputedStyle(el).position !== "fixed") {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue; // doesn't clip
        const pr = p.getBoundingClientRect();
        // padding box: inside the border, and without the scrollbar
        left = Math.max(left, pr.left + p.clientLeft);
        top = Math.max(top, pr.top + p.clientTop);
        right = Math.min(right, pr.left + p.clientLeft + p.clientWidth);
        bottom = Math.min(bottom, pr.top + p.clientTop + p.clientHeight);
      }
    }
    // clip to the iframe's own viewport too
    right = Math.min(right, window.innerWidth);
    bottom = Math.min(bottom, window.innerHeight);

    return right > left && bottom > top
      ? { x: left, y: top, w: right - left, h: bottom - top }
      : { x: left, y: top, w: 0, h: 0 }; // fully hidden
  }

  // an element as an outline box
  const boxOf = (el) => {
    const id = idOf(el);
    const v = visibleRect(el);
    return {
      id,
      label: labelOf(el),
      x: v.x,
      y: v.y,
      w: v.w,
      h: v.h,
    };
  };

  // The ids of an element's ancestors, outermost first, below <body> (html and body are
  // not rows). Sent with hover so the host can light up the nearest row it is showing
  // when the hovered element's own row is hidden inside a collapsed parent.
  const ancestorIds = (el) => {
    const path = [];
    for (
      let n = el.parentElement;
      n && n !== document.body;
      n = n.parentElement
    )
      path.unshift(idOf(n));
    return path;
  };
  const hoverMessage = (el) => ({
    type: "HOVER",
    box: boxOf(el),
    path: ancestorIds(el),
  });

  // ---- shortcut keys typed in the page ----
  // They never reach the host, so forward them. This MUST be registered before the
  // select-mode gate below: the gate stopImmediatePropagation()s keydown and would starve it.
  const isTyping = (el) =>
    el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName);
  const KEYS = ["v", "V", "i", "I", "Escape", "Enter", "Tab"];
  window.addEventListener(
    "keydown",
    (e) => {
      if (!agentPort || !KEYS.includes(e.key)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // not ours: Ctrl+V, Ctrl+Shift+I...
      if (e.key !== "Escape" && isTyping(document.activeElement)) return;
      agentPort.postMessage({ type: "KEY", key: e.key, shift: e.shiftKey });
    },
    true,
  );

  // ---- select-mode gate: clicks, focus and submits never reach the page ----
  const BLOCK = [
    "pointerdown",
    "mousedown",
    "mouseup",
    "click",
    "dblclick",
    "focusin",
    "submit",
    "keydown",
  ];
  BLOCK.forEach((t) =>
    window.addEventListener(
      t,
      (e) => {
        if (mode !== "select") return;
        e.stopImmediatePropagation();
        e.preventDefault();
      },
      true,
    ),
  );

  // ---- identity across re-renders ----
  // Fingerprint of a tracked element, taken while it is still alive, so we can
  // find it again after the page throws the node away and builds a new one.
  const fps = new Map(); // id -> { anchor, path, sig }
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const sigOf = (el) =>
    el.tagName +
    "|" +
    norm(el.textContent) +
    "|" +
    [...el.attributes]
      .map((a) => `${a.name}=${a.value}`)
      .sort()
      .join(";");
  // nearest data-key (self or ancestor) + position path under it.
  // The path is only counted inside the keyed item, so inserting rows
  // before it can't shift it.
  function anchorOf(el) {
    const path = [];
    for (let n = el; n; n = n.parentElement) {
      if (n.dataset?.key)
        return { anchor: n.dataset.key, path: path.join(">") };
      const sibs = n.parentElement ? [...n.parentElement.children] : [];
      path.unshift(`${n.tagName}:${sibs.indexOf(n)}`);
    }
    return { anchor: null, path: "" };
  }
  const fingerprint = (el) => ({ ...anchorOf(el), sig: sigOf(el) });
  const flat = (nodes) =>
    nodes.flatMap((n) =>
      n.nodeType === 1 ? [n, ...n.querySelectorAll("*")] : [],
    );

  // the host selected these: remember what they look like
  function track(list) {
    tracked = new Set(list);
    list.forEach((id) => {
      const el = byId.get(id)?.deref();
      if (el) fps.set(id, fingerprint(el));
    });
  }

  // Find tracked elements that were replaced. Prefer dropping to guessing.
  function reidentify(records) {
    const removed = flat(records.flatMap((r) => [...r.removedNodes]));
    const added = flat(records.flatMap((r) => [...r.addedNodes])).filter(
      (e) => e.isConnected,
    );
    const addedFps = new Map(added.map((e) => [e, fingerprint(e)]));
    const taken = new Set();
    const gone = [];

    tracked.forEach((id) => {
      if (byId.get(id)?.deref()?.isConnected) return; // still there
      const fp = fps.get(id);
      let hit = null;
      if (fp?.anchor) {
        // keyed item (or inside one): same key + same path, must be unique
        const m = added.filter((e) => {
          const f = addedFps.get(e);
          return f.anchor === fp.anchor && f.path === fp.path;
        });
        if (m.length === 1) hit = m[0];
      } else if (fp) {
        // no key anywhere: only an exact, one-to-one signature match counts
        const was = removed.filter((e) => sigOf(e) === fp.sig).length;
        const m = added.filter((e) => addedFps.get(e).sig === fp.sig);
        if (was === 1 && m.length === 1) hit = m[0];
      }
      if (hit && !taken.has(hit)) {
        taken.add(hit);
        ids.set(hit, id);
        byId.set(id, new WeakRef(hit));
        fps.set(id, addedFps.get(hit));
      } else {
        gone.push(id);
      }
    });

    gone.forEach((id) => {
      tracked.delete(id);
      fps.delete(id);
    });
    return gone;
  }

  new MutationObserver((records) => {
    if (!tracked.size) return;
    const gone = reidentify(records);
    if (gone.length && agentPort)
      agentPort.postMessage({ type: "GONE", ids: gone });
    schedule();
  }).observe(document, { childList: true, subtree: true });

  // ---- rects: keep the host's outlines glued to their elements ----
  function sendRects() {
    if (!agentPort || mode !== "select") return;
    const want = new Set(tracked);
    if (lastHover) want.add(ids.get(lastHover));
    const boxes = [];
    want.forEach((id) => {
      const el = byId.get(id)?.deref();
      if (el?.isConnected) boxes.push(boxOf(el)); // skip elements that are gone
    });
    agentPort.postMessage({ type: "RECT_UPDATE", boxes });
  }
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sendRects();
    });
  };
  window.addEventListener("scroll", schedule, true); // true = capture
  window.addEventListener("resize", schedule);

  // ---- pointer ----
  // Hover + select. Plain capture listeners, not in BLOCK, so the gate doesn't kill them.
  window.addEventListener(
    "pointermove",
    (e) => {
      if (mode !== "select" || !agentPort || e.target === lastHover) return;
      lastHover = e.target;
      agentPort.postMessage(hoverMessage(e.target));
    },
    true,
  );

  // pointer left the page: clear hover
  window.addEventListener(
    "pointerout",
    (e) => {
      if (e.relatedTarget || !agentPort) return;
      lastHover = null;
      agentPort.postMessage({ type: "HOVER", box: null });
    },
    true,
  );

  // pointerup, not click: disabled buttons never fire click
  window.addEventListener(
    "pointerup",
    (e) => {
      if (mode !== "select" || !agentPort || e.button !== 0) return;
      agentPort.postMessage({
        type: "SELECT",
        box: boxOf(e.target),
        shift: e.shiftKey,
      });
    },
    true,
  );

  // ---- requests from the host, by type ----
  // Requests carry an `id` that the reply must echo, so the host can match them up.
  const handlers = {
    PING({ id }) {
      agentPort.postMessage({ id, type: "PONG" });
      console.log(`[${docId}] Sent PONG`);
    },

    SET_MODE({ mode: next }) {
      mode = next;
      lastHover = null;
      if (mode !== "select")
        agentPort.postMessage({ type: "HOVER", box: null }); // clear outline
    },

    TRACK({ ids: list }) {
      track(list);
    },

    // a layers-panel row is hovered: outline that element, same path as a real hover
    HOVER_NODE({ from }) {
      if (mode !== "select") return;
      const el = from && byId.get(from)?.deref();
      lastHover = el?.isConnected ? el : null;
      agentPort.postMessage(
        lastHover ? hoverMessage(lastHover) : { type: "HOVER", box: null },
      );
    },

    // Enter / Tab / Shift+Tab, and a layers row click (dir "self")
    NAVIGATE({ id, from, dir }) {
      const el = byId.get(from)?.deref();
      const to =
        el &&
        {
          child: el.firstElementChild,
          parent: el.parentElement,
          next: el.nextElementSibling,
          prev: el.previousElementSibling,
          self: el,
        }[dir];
      agentPort.postMessage({
        id,
        type: "NAVIGATED",
        // html and body are not elements here: Shift+Enter at the top level does nothing
        box:
          to && to !== document.documentElement && to !== document.body
            ? boxOf(to)
            : null,
      });
    },

    GET_CHILDREN({ id, from }) {
      // no id = the top level, which is the children of <body> (html and body are not elements here)
      const el = from ? byId.get(from)?.deref() : document.body;
      // id given but element gone: null, so the host shows an error instead of the top level
      const kids = el?.isConnected ? [...el.children] : null;
      agentPort.postMessage({
        id,
        type: "CHILDREN",
        children: kids?.map(rowOf) ?? null,
      });
    },

    // every level from the top down to an element, in one go (30 levels would be 30 requests)
    REVEAL({ id, from }) {
      const el = byId.get(from)?.deref();
      let levels = null;
      if (
        el?.isConnected &&
        document.body.contains(el) &&
        el !== document.body
      ) {
        // from the top level (children of <body>) down to el's parent, each level with all its children
        const chain = [];
        for (
          let n = el.parentElement;
          n && n !== document.body;
          n = n.parentElement
        )
          chain.unshift(n);
        levels = [
          { from: null, children: [...document.body.children] },
          ...chain.map((n) => ({ from: idOf(n), children: [...n.children] })),
        ].map((l) => ({ from: l.from, children: l.children.map(rowOf) }));
      }
      agentPort.postMessage({ id, type: "REVEALED", levels });
    },

    // Layers search. The DOM lives here, and most of it isn't loaded in the tree yet.
    SEARCH({ id, q: query }) {
      const q = String(query ?? "")
        .trim()
        .toLowerCase();
      const LIMIT = 50;
      const hits = [];
      let total = 0;
      if (q) {
        for (const el of document.body.querySelectorAll("*")) {
          const hay =
            `${labelOf(el)} ${el.getAttribute("class") ?? ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
          if (hits.length < LIMIT) hits.push(rowOf(el));
          total++;
        }
      }
      agentPort.postMessage({ id, type: "SEARCHED", hits, total });
    },

    // Inspector: live values for the selected elements (null = that one is gone)
    INSPECT({ id, ids: wanted }) {
      const lives = (wanted ?? []).map((i) => {
        const el = byId.get(i)?.deref();
        return el?.isConnected ? liveOf(el) : null;
      });
      agentPort.postMessage({ id, type: "INSPECTED", lives });
    },
  };

  function handlePortMessage(event) {
    console.log(`[${docId}] Received:`, event.data.type);
    handlers[event.data.type]?.(event.data);
  }

  // ---- connection: say hello until the host answers with a port ----
  let connected = false;
  let helloInterval = null;

  function sayHello() {
    if (!connected && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "AGENT_HELLO", docId }, HOST_ORIGIN);
      console.log(`[${docId}] Sent AGENT_HELLO`);
    }
  }

  // Say hello immediately, then retry every 100ms until we get AGENT_READY
  sayHello();
  helloInterval = setInterval(sayHello, 100);

  // Listen for AGENT_READY from host
  window.addEventListener("message", (event) => {
    console.log(
      `[${docId}] Received message:`,
      event.data.type,
      "from origin:",
      event.origin,
    );

    if (event.origin !== HOST_ORIGIN) {
      console.warn(
        `[${docId}] Rejected: untrusted origin ${event.origin}, expected ${HOST_ORIGIN}`,
      );
      return;
    }

    if (event.data.type === "AGENT_READY") {
      console.log(
        `[${docId}] AGENT_READY received, ports:`,
        event.ports.length,
      );
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
})();
