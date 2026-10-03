import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import {
  onTreeChange,
  flatten,
  expand,
  collapse,
  ROOT,
  reveal,
} from "../agent/tree";
import { getOverlay, onOverlayChange } from "../agent/host-bridge";

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
        const [screenId, iframe, id] = found as [string, HTMLIFrameElement, string];
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
    pendingScroll.current = null;
  });

  return (
    <div
      ref={boxRef}
      className="w-72 h-screen overflow-auto"
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: rows.length * ROW_H, position: "relative" }}>
        {rows.slice(first, last).map((r, i) => (
          <div
            key={`${r.screen.id}:${r.id}`}
            style={{
              position: "absolute",
              top: (first + i) * ROW_H,
              height: ROW_H,
              paddingLeft: r.depth * 12,
            }}
          >
            {r.node.row.hasChildren ? (
              <button
                onClick={() =>
                  r.node.expanded
                    ? collapse(r.iframe, r.id)
                    : expand(r.iframe, r.id)
                }
              >
                {r.node.expanded ? "▾" : "▸"}
              </button>
            ) : (
              <span style={{ display: "inline-block", width: 16 }} />
            )}
            <span>{r.id === ROOT ? r.screen.name : r.node.row.label}</span>
            {r.node.status === "loading" && <span>…</span>}
            {r.node.status === "error" && (
              <button onClick={() => expand(r.iframe, r.id)}>Retry</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LayersPanel;
