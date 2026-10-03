import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  collapse,
  expand,
  flatten,
  getNode,
  onTreeChange,
  ROOT,
  type Hit,
} from "../../agent/tree";
import {
  getActiveIframe,
  onOverlayChange,
  selectNode,
} from "../../agent/overlay";
import { ROW_H } from "./constants";
import LayerRow, { type LayerRowData } from "./LayerRow";
import SearchResults from "./SearchResults";
import { useRevealOnSelect } from "./useRevealOnSelect";
import { useSearch } from "./useSearch";

// The element tree of the active preview: the one last picked in Select mode.
const LayersPanel = ({
  iframeRefs,
}: {
  iframeRefs: RefObject<Map<string, HTMLIFrameElement>>;
}) => {
  const [, bump] = useReducer((x) => x + 1, 0);
  const [top, setTop] = useState(0); // scroll position, for the virtual window
  const boxRef = useRef<HTMLDivElement>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null); // keyboard cursor row
  const [query, setQuery] = useState("");
  const pendingScroll = useRef<string | null>(null);

  // snapshot of the iframes, taken once the refs are filled (mount effect)
  const [iframes, snapshot] = useReducer(
    () => new Map(iframeRefs.current),
    new Map<string, HTMLIFrameElement>(),
  );
  useEffect(() => {
    snapshot();
    return onTreeChange(bump);
  }, []);
  // selection or active preview changed: repaint the highlight
  useEffect(() => onOverlayChange(bump), []);
  useRevealOnSelect(iframeRefs, (key) => {
    pendingScroll.current = key; // the effect below scrolls to it once rendered
    bump();
  });

  // ---- which preview, which rows ----
  const active = getActiveIframe();
  const activeId = active
    ? [...iframes].find(([, i]) => i === active)?.[0]
    : undefined;
  const root = active ? getNode(active, ROOT) : undefined;

  // The top level loads when a preview becomes active, and again after its page
  // navigated (the tree was cleared, so ROOT is fresh).
  useEffect(() => {
    if (active && root && !root.expanded) expand(active, ROOT);
  });

  const rows: LayerRowData[] =
    active && activeId
      ? flatten(active).map((f) => ({ ...f, iframe: active }))
      : [];
  const keyOf = (r: LayerRowData) => `${activeId}:${r.id}`;

  // virtualizing: only the rows in view (plus a few) are drawn
  const first = Math.max(0, Math.floor(top / ROW_H) - 5);
  const last = Math.min(
    rows.length,
    Math.ceil((top + window.innerHeight) / ROW_H) + 5,
  );

  // Scroll position is remembered per preview. Back on A, A is where it was left.
  const scrolls = useRef(new Map<HTMLIFrameElement, number>());
  const q = query.trim();
  useEffect(() => {
    // (the scroll box is not there while search results are showing)
    if (boxRef.current && active)
      boxRef.current.scrollTop = scrolls.current.get(active) ?? 0;
  }, [active, q]);

  // scroll to a revealed row
  useEffect(() => {
    // no scroll box while search results are showing: keep it pending until the tree is back
    if (!pendingScroll.current || !boxRef.current) return;
    const i = rows.findIndex((r) => keyOf(r) === pendingScroll.current);
    if (i < 0) return;
    boxRef.current.scrollTop = Math.max(0, i * ROW_H - 100); // leave some rows above it
    // deep rows are indented past the panel's width (30 levels * 12px): bring the label into view too
    boxRef.current.scrollLeft = Math.max(0, rows[i].depth * 12 - 100);
    pendingScroll.current = null;
  });

  // ---- search ----
  const results = useSearch(q, active, activeId);
  const pick = (h: Hit) => {
    selectNode(h.iframe, h.row.id).catch(() => {});
    setQuery(""); // back to the tree: selecting reveals the row there
  };

  // ---- keyboard (tree pattern): up/down, left/right, home/end, enter ----
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
              next = j; // the parent
              break;
            }
        break;
      case "Enter":
      case " ":
        selectNode(r.iframe, r.id).catch(() => {});
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

  let body;
  if (!active) {
    body = <div className="px-2 text-sm">Click something in a preview</div>;
  } else if (q) {
    body = <SearchResults results={results} onPick={pick} />;
  } else {
    body = (
      <>
        {root?.status === "loading" && !rows.length && (
          <div className="px-2 text-sm">Loading…</div>
        )}
        {root?.status === "error" && (
          <div className="px-2 text-sm">
            Couldn't load{" "}
            <button className="underline" onClick={() => expand(active, ROOT)}>
              Retry
            </button>
          </div>
        )}
        <div
          ref={boxRef}
          role="tree"
          tabIndex={0}
          aria-activedescendant={focusKey ? `layer-${focusKey}` : undefined}
          onKeyDown={onTreeKey}
          className="flex-1 overflow-auto outline-none"
          onScroll={(e) => {
            setTop(e.currentTarget.scrollTop);
            scrolls.current.set(active, e.currentTarget.scrollTop);
          }}
        >
          {/* a tall box so the scrollbar has its real size, rows are placed inside it */}
          <div style={{ height: rows.length * ROW_H, position: "relative" }}>
            {rows.slice(first, last).map((r, i) => (
              <LayerRow
                key={keyOf(r)}
                row={r}
                rowKey={keyOf(r)}
                top={(first + i) * ROW_H}
                focused={focusKey === keyOf(r)}
                // row click = select in the preview (the arrow only toggles)
                onClick={() => {
                  setFocusKey(keyOf(r));
                  selectNode(r.iframe, r.id).catch(() => {});
                }}
              />
            ))}
          </div>
        </div>
      </>
    );
  }

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
      {body}
    </div>
  );
};

export default LayersPanel;
