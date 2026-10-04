import { collapse, expand, type Flat } from "../../agent/tree";
import { getOverlay, hoverNode } from "../../agent/overlay";
import { ChevronRight, Spinner } from "../icons";
import { ROW_H } from "./constants";

// A row of the visible tree, with the preview it belongs to
export type LayerRowData = Flat & { iframe: HTMLIFrameElement };

const INDENT = 12; // px per level

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
  hovered,
  onClick,
}: {
  row: LayerRowData;
  rowKey: string;
  top: number;
  focused: boolean; // the keyboard cursor is here
  hovered: boolean; // the pointer is over this element in the preview (or over its hidden descendant)
  onClick: () => void;
}) {
  const overlay = getOverlay(r.iframe);
  const selected = overlay.selected.some((b) => b.id === r.id);
  const indent = r.depth * INDENT;

  return (
    <div
      id={`layer-${rowKey}`}
      role="treeitem"
      aria-level={r.depth + 1}
      aria-selected={selected}
      aria-expanded={r.node.row.hasChildren ? r.node.expanded : undefined}
      onClick={onClick}
      className={`flex cursor-pointer items-center whitespace-nowrap pr-3 text-xs ${
        selected
          ? "bg-purple-50 font-medium text-slate-900 shadow-[inset_2px_0_0_var(--color-purple-500)]"
          : hovered
            ? "bg-sky-50 text-slate-800"
            : "text-slate-600 hover:bg-slate-50"
      } ${focused ? "ring-1 ring-inset ring-sky-400" : ""}`}
      style={{
        position: "absolute",
        top,
        height: ROW_H,
        paddingLeft: indent + 8,
        // a deep row must not wrap, and must be as wide as its label
        width: "max-content",
        minWidth: "100%",
        // thin guide lines, one per level
        backgroundImage: indent
          ? `repeating-linear-gradient(to right, var(--color-slate-200) 0 1px, transparent 1px ${INDENT}px)`
          : undefined,
        backgroundSize: `${indent}px 100%`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "8px 0",
      }}
      // row -> preview. The reverse (preview -> row) is the highlight above.
      onMouseEnter={() => hoverNode(r.iframe, r.id)}
      onMouseLeave={() => hoverNode(r.iframe, null)}
    >
      {r.node.row.hasChildren ? (
        // a span, not a button: it must not take focus away from the tree
        <span
          className="mr-1 flex size-4 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600"
          onClick={(e) => {
            e.stopPropagation(); // the arrow only toggles, it doesn't select
            toggle(r);
          }}
        >
          <ChevronRight
            className={`size-3.5 transition-transform ${
              r.node.expanded ? "rotate-90" : ""
            }`}
          />
        </span>
      ) : (
        <span className="mr-1 flex size-4 shrink-0 items-center justify-center">
          <span className="size-1 rounded-full bg-slate-300" />
        </span>
      )}
      <span>{r.node.row.label}</span>
      {r.node.status === "loading" && (
        <Spinner className="ml-2 size-3 text-slate-400" />
      )}
      {r.node.status === "error" && (
        <span className="ml-2 text-[11px] text-red-600">
          Couldn't load{" "}
          <button
            tabIndex={-1}
            className="font-medium underline"
            onClick={(e) => {
              e.stopPropagation();
              expand(r.iframe, r.id);
            }}
          >
            Retry
          </button>
        </span>
      )}
    </div>
  );
}
