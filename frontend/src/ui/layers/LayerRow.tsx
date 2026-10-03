import { collapse, expand, type Flat } from "../../agent/tree";
import { getOverlay, hoverNode } from "../../agent/overlay";
import { ROW_H } from "./constants";

// A row of the visible tree, with the preview it belongs to
export type LayerRowData = Flat & { iframe: HTMLIFrameElement };

function toggle(r: LayerRowData) {
  if (r.node.expanded) collapse(r.iframe, r.id);
  else expand(r.iframe, r.id);
}

// One row, placed at `top` pixels (the list is virtualized, so rows are absolutely positioned).
// Clicking the row is up to the caller. The arrow only opens and closes.
export default function LayerRow({
  row: r,
  rowKey,
  top,
  focused,
  onClick,
}: {
  row: LayerRowData;
  rowKey: string;
  top: number;
  focused: boolean; // the keyboard cursor is here
  onClick: () => void;
}) {
  const overlay = getOverlay(r.iframe);
  return (
    <div
      id={`layer-${rowKey}`}
      role="treeitem"
      aria-level={r.depth + 1}
      aria-expanded={r.node.row.hasChildren ? r.node.expanded : undefined}
      onClick={onClick}
      style={{
        outline: focused ? "1px dotted #475569" : undefined,
        outlineOffset: -1,
        cursor: "pointer",
        position: "absolute",
        top,
        height: ROW_H,
        paddingLeft: r.depth * 12,
        // without these a deep row has no room left for its label and the text wraps
        whiteSpace: "nowrap",
        width: "max-content",
        minWidth: "100%",
        background: overlay.selected.some((b) => b.id === r.id)
          ? "#fed7aa" // same orange as the selection outline
          : overlay.hover?.id === r.id
            ? "#dbeafe" // same blue as the hover outline
            : undefined,
      }}
      // row -> preview. The reverse (preview -> row) is the background above.
      onMouseEnter={() => hoverNode(r.iframe, r.id)}
      onMouseLeave={() => hoverNode(r.iframe, null)}
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
      <span>{r.node.row.label}</span>
      {r.node.status === "loading" && <span> …</span>}
      {r.node.status === "error" && (
        <>
          {" "}
          Couldn't load{" "}
          <button
            tabIndex={-1}
            className="underline"
            onClick={(e) => {
              e.stopPropagation();
              expand(r.iframe, r.id);
            }}
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}
