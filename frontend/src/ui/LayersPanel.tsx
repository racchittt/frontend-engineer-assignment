import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  onTreeChange,
  flatten,
  expand,
  collapse,
  ROOT,
  reveal,
  search,
  type Hit,
} from "../agent/tree";
import {
  getOverlay,
  onOverlayChange,
  hoverNode,
  selectNode,
} from "../agent/host-bridge";

interface Screen {
  id: string;
  name: string;
}
const ROW_H = 24;

const LayersPanel = ({
  screens,
  iframeRefs,
}: {
  screens: Screen[];
  iframeRefs: RefObject<Map<string, HTMLIFrameElement>>;
}) => {
  const [, bump] = useReducer((x) => x + 1, 0);
  const [top, setTop] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null); // keyboard cursor row
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{
    q: string;
    hits: Hit[];
    total: number;
  } | null>(null);
  const searchSeq = useRef(0);
  // snapshot of the iframes, taken once the refs are filled (mount effect)
  const [iframes, snapshot] = useReducer(
    () => new Map(iframeRefs.current),
    new Map<string, HTMLIFrameElement>(),
  );
  useEffect(() => {
    snapshot();
    return onTreeChange(bump);
  }, []);
  const lastRevealed = useRef("");
  const pendingScroll = useRef<string | null>(null);
  useEffect(
    () =>
      onOverlayChange(() => {
        bump(); // selection changed (or was cleared): repaint the highlight
        // only one preview holds the selection, so look at all of them first
        // (resetting inside the loop would be undone by the other previews)
        let found: [string, HTMLIFrameElement, string] | null = null;
        iframeRefs.current.forEach((iframe, screenId) => {
          const sel = getOverlay(iframe).selected.at(-1);
          if (sel) found = [screenId, iframe, sel.id];
        });
        if (!found) {
          lastRevealed.current = ""; // so Esc, then reselecting the same element reveals again
          return;
        }
        const [screenId, iframe, id] = found as [
          string,
          HTMLIFrameElement,
          string,
        ];
        const key = `${screenId}:${id}`;
        if (key === lastRevealed.current) return; // RECT_UPDATE fires a lot
        lastRevealed.current = key;
        reveal(iframe, id)
          .then((ok) => {
            // a newer selection may have replaced this one while we waited
            if (ok && lastRevealed.current === key) pendingScroll.current = key;
            bump();
          })
          .catch(() => {
            lastRevealed.current = ""; // timeout: allow a retry
          });
      }),
    [iframeRefs],
  );

  const rows = screens.flatMap((screen) => {
    const iframe = iframes.get(screen.id);
    return iframe ? flatten(iframe).map((f) => ({ ...f, iframe, screen })) : [];
  });

  //virtulizing the rows
  const first = Math.max(0, Math.floor(top / ROW_H) - 5);
  const last = Math.min(
    rows.length,
    Math.ceil((top + window.innerHeight) / ROW_H) + 5,
  );

  useEffect(() => {
    if (!pendingScroll.current) return;
    const i = rows.findIndex(
      (r) => `${r.screen.id}:${r.id}` === pendingScroll.current,
    );
    if (i < 0) return;
    boxRef.current!.scrollTop = Math.max(0, i * ROW_H - 100); // leave some rows above it
    // deep rows are indented past the panel's width (30 levels * 12px): bring the label into view too
    boxRef.current!.scrollLeft = Math.max(0, rows[i].depth * 12 - 100);
    pendingScroll.current = null;
  });

  // ---- search: the agent scans its whole DOM, the tree only has what was loaded ----
  const q = query.trim();
  useEffect(() => {
    const seq = ++searchSeq.current; // bumped on every change, so an older reply can't land late
    if (!q) return;
    const t = setTimeout(() => {
      search(iframes, q).then((r) => {
        if (seq === searchSeq.current) setFound({ q, ...r });
      });
    }, 250); // debounce
    return () => clearTimeout(t);
  }, [q, iframes]);
  const results = q && found?.q === q ? found : null;

  const pick = (h: Hit) => {
    selectNode(h.iframe, h.row.id).catch(() => {});
    setQuery(""); // back to the tree: selecting reveals the row there
  };

  // ---- keyboard (tree pattern): up/down, left/right, home/end, enter ----
  const keyOf = (r: (typeof rows)[number]) => `${r.screen.id}:${r.id}`;
  const toggle = (r: (typeof rows)[number]) => {
    if (r.node.expanded) collapse(r.iframe, r.id);
    else expand(r.iframe, r.id);
  };
  const onTreeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !rows.length) return;
    const i = Math.max(
      0,
      rows.findIndex((r) => keyOf(r) === focusKey),
    );
    const r = rows[i];
    let next = i;
    switch (e.key) {
      case "ArrowDown":
        next = Math.min(rows.length - 1, i + 1);
        break;
      case "ArrowUp":
        next = Math.max(0, i - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = rows.length - 1;
        break;
      case "ArrowRight":
        if (r.node.row.hasChildren && !r.node.expanded) expand(r.iframe, r.id);
        else if (r.node.expanded && r.node.children.length) next = i + 1; // first child
        break;
      case "ArrowLeft":
        if (r.node.expanded) collapse(r.iframe, r.id);
        else
          for (let j = i - 1; j >= 0; j--)
            if (rows[j].depth === r.depth - 1) {
              next = j;
              break;
            } // parent
        break;
      case "Enter":
      case " ":
        if (r.id === ROOT) toggle(r);
        else selectNode(r.iframe, r.id).catch(() => {});
        break;
      default:
        return; // not ours (Tab, V, I, Esc...): let it through
    }
    e.preventDefault();
    e.stopPropagation(); // keep the app-level shortcuts out of it
    setFocusKey(keyOf(rows[next]));
    const box = boxRef.current!; // keep the cursor row in view
    const y = next * ROW_H;
    if (y < box.scrollTop) box.scrollTop = y;
    else if (y + ROW_H > box.scrollTop + box.clientHeight)
      box.scrollTop = y + ROW_H - box.clientHeight;
  };

  return (
    <div className="w-72 shrink-0 h-screen flex flex-col">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery("");
          if (e.key === "Enter" && results?.hits[0]) pick(results.hits[0]);
        }}
        placeholder="Search layers"
        className="w-full border px-2 py-1 mb-1 text-sm"
      />
      {q ? (
        <div className="flex-1 overflow-auto text-sm">
          {!results && <div className="px-2">Searching…</div>}
          {results?.hits.length === 0 && <div className="px-2">No matches</div>}
          {results?.hits.map((h) => (
            <button
              key={`${h.screenId}:${h.row.id}`}
              className="block w-full text-left px-2 truncate hover:bg-orange-100"
              onClick={() => pick(h)}
            >
              {h.row.label}{" "}
              <span className="text-gray-500">
                {screens.find((s) => s.id === h.screenId)?.name}
              </span>
            </button>
          ))}
          {results && results.total > results.hits.length && (
            <div className="px-2 text-gray-500">
              first {results.hits.length} of {results.total}, keep typing to
              narrow
            </div>
          )}
        </div>
      ) : (
        <div
          ref={boxRef}
          role="tree"
          tabIndex={0}
          aria-activedescendant={focusKey ? `layer-${focusKey}` : undefined}
          onKeyDown={onTreeKey}
          className="flex-1 overflow-auto outline-none"
          onScroll={(e) => setTop(e.currentTarget.scrollTop)}
        >
          <div style={{ height: rows.length * ROW_H, position: "relative" }}>
            {rows.slice(first, last).map((r, i) => (
              <div
                key={keyOf(r)}
                id={`layer-${keyOf(r)}`}
                role="treeitem"
                aria-level={r.depth + 1}
                aria-expanded={
                  r.node.row.hasChildren ? r.node.expanded : undefined
                }
                // row click = select in the preview (the arrow only toggles)
                onClick={() => {
                  setFocusKey(keyOf(r));
                  if (r.id === ROOT) toggle(r);
                  else selectNode(r.iframe, r.id).catch(() => {});
                }}
                style={{
                  outline:
                    focusKey === keyOf(r) ? "1px dotted #475569" : undefined,
                  outlineOffset: -1,
                  cursor: "pointer",
                  position: "absolute",
                  top: (first + i) * ROW_H,
                  height: ROW_H,
                  paddingLeft: r.depth * 12,
                  // without these a deep row has no room left for its label and the text wraps
                  whiteSpace: "nowrap",
                  width: "max-content",
                  minWidth: "100%",
                  background: getOverlay(r.iframe).selected.some(
                    (b) => b.id === r.id,
                  )
                    ? "#fed7aa" // same orange as the selection outline
                    : getOverlay(r.iframe).hover?.id === r.id
                      ? "#dbeafe" // same blue as the hover outline
                      : undefined,
                }}
                // row -> preview. The reverse (preview -> row) is the background above.
                onMouseEnter={() => r.id !== ROOT && hoverNode(r.iframe, r.id)}
                onMouseLeave={() => r.id !== ROOT && hoverNode(r.iframe, null)}
              >
                {r.node.row.hasChildren ? (
                  // a span, not a button: it must not take focus away from the tree
                  <span
                    style={{ display: "inline-block", width: 16 }}
                    onClick={(e) => {
                      e.stopPropagation(); // the arrow only toggles, it doesn't select
                      toggle(r);
                    }}
                  >
                    {r.node.expanded ? "▾" : "▸"}
                  </span>
                ) : (
                  <span style={{ display: "inline-block", width: 16 }} />
                )}
                <span>{r.id === ROOT ? r.screen.name : r.node.row.label}</span>
                {r.node.status === "loading" && <span>…</span>}
                {r.node.status === "error" && (
                  <button
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      expand(r.iframe, r.id);
                    }}
                  >
                    Retry
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LayersPanel;
