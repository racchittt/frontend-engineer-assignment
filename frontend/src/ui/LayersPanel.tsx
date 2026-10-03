import { useEffect, useReducer, useState, type RefObject } from "react";
import { onTreeChange, flatten, expand, collapse, ROOT } from "../agent/tree";

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
  // snapshot of the iframes, taken once the refs are filled (mount effect)
  const [iframes, snapshot] = useReducer(
    () => new Map(iframeRefs.current),
    new Map<string, HTMLIFrameElement>(),
  );
  useEffect(() => {
    snapshot();
    return onTreeChange(bump);
  }, []);

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
  return (
    <div
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
