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
  getOverlay,
  onOverlayChange,
  selectNode,
} from "../../agent/overlay";
import type { Screen } from "../board/Board";
import { Close, Layers, Search, Spinner } from "../icons";
import { ROW_H } from "./constants";
import LayerRow, { type LayerRowData } from "./LayerRow";
import SearchResults from "./SearchResults";
import { useRevealOnSelect } from "./useRevealOnSelect";
import { useSearch } from "./useSearch";

// The element tree of the active preview: the one last picked in Select mode.
const LayersPanel = ({
  iframeRefs,
  screens,
}: {
  iframeRefs: RefObject<Map<string, HTMLIFrameElement>>;
  screens: Screen[];
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

  // The row to light up for the element the pointer is over in the preview: its own row,
  // or the nearest ancestor row that is showing when its row is inside a collapsed parent.
  // Hover never opens anything.
  const hover = active ? getOverlay(active) : null;
  const shown = new Set(rows.map((r) => r.id));
  const hoverRowId =
    hover?.hover &&
    [...hover.hoverPath, hover.hover.id].reverse().find((id) => shown.has(id));

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

  // When the page adds or removes rows above the ones you are looking at, keep those rows
  // where they are. We remember the rows in view, and after a change find the first of them
  // that is still there (some rows are recreated by the page and don't survive). At the very
  // top there is nothing to hold on to, so new rows push in at the top.
  const inView = useRef<{ key: string; index: number }[]>([]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const seen = inView.current;
    if (seen.length && seen[0].index > 0) {
      for (const { key, index } of seen) {
        const i = rows.findIndex((r) => keyOf(r) === key);
        if (i < 0) continue;
        if (i !== index) box.scrollTop += (i - index) * ROW_H;
        break;
      }
    }
    const at = Math.round(box.scrollTop / ROW_H);
    const count = Math.ceil(box.clientHeight / ROW_H);
    inView.current = rows
      .slice(at, at + count)
      .map((r, n) => ({ key: keyOf(r), index: at + n }));
  });

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
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Layers className="size-4.5" />
        </span>
        <p className="text-xs font-medium text-slate-700">
          Click something in a preview
        </p>
        <p className="text-[11px] text-slate-400">
          Its element tree shows up here.
        </p>
      </div>
    );
  } else if (q) {
    body = <SearchResults results={results} onPick={pick} />;
  } else {
    body = (
      <>
        {root?.status === "loading" && !rows.length && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
            <Spinner className="size-3.5" />
            Loading…
          </div>
        )}
        {root?.status === "error" && (
          <div className="px-3 py-2 text-xs text-red-600">
            Couldn't load{" "}
            <button
              className="font-medium underline"
              onClick={() => expand(active, ROOT)}
            >
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
                hovered={hoverRowId === r.id}
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

  const activeName = screens.find((s) => s.id === activeId)?.name;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="space-y-2.5 border-b border-slate-100 px-3 pb-3 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-slate-900">
            Layers
          </h2>
          {activeName && (
            <span
              title="Active preview"
              className="flex max-w-40 items-center gap-1.5 truncate rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-purple-500" />
              <span className="truncate">{activeName}</span>
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "Enter" && results?.hits[0]) pick(results.hits[0]);
            }}
            placeholder="Search layers"
            aria-label="Search layers"
            className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-xs text-slate-800 outline-none focus-visible:outline-none placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            >
              <Close className="size-3" />
            </button>
          )}
        </div>
      </div>
      {body}
    </aside>
  );
};

export default LayersPanel;
