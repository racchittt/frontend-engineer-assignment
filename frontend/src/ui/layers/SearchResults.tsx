import { getOverlay, hoverNode } from "../../agent/overlay";
import type { SearchRow } from "../../protocol";
import { Spinner } from "../icons";
import { ROW_H } from "./constants";

const INDENT = 12; // px per level, as in the tree

// the matching part of a label, in bold
function Label({ text, q }: { text: string; q: string }) {
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <b className="font-semibold text-purple-700">
        {text.slice(at, at + q.length)}
      </b>
      {text.slice(at + q.length)}
    </>
  );
}

export default function SearchResults({
  results,
  iframe,
  q,
  onPick,
}: {
  results: { rows: SearchRow[]; total: number } | null;
  iframe: HTMLIFrameElement;
  q: string;
  onPick: (id: string) => void;
}) {
  if (!results)
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500">
        <Spinner className="size-3.5" />
        Searching…
      </div>
    );
  if (results.rows.length === 0)
    return <p className="px-3 py-3 text-xs text-slate-500">No matches</p>;

  const shown = results.rows.filter((r) => r.match).length;
  const selected = new Set(getOverlay(iframe).selected.map((b) => b.id));

  return (
    <div className="flex-1 overflow-auto">
      <p className="sticky top-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5 text-[11px] text-slate-500">
        {results.total > shown
          ? `First ${shown} of ${results.total} matches, keep typing to narrow`
          : `${results.total} ${results.total === 1 ? "match" : "matches"}`}
      </p>
      {results.rows.map((r) => (
        <div
          key={r.id}
          role="treeitem"
          aria-level={r.depth + 1}
          aria-selected={selected.has(r.id)}
          onClick={() => onPick(r.id)}
          onMouseEnter={() => hoverNode(iframe, r.id)}
          onMouseLeave={() => hoverNode(iframe, null)}
          style={{
            height: ROW_H,
            paddingLeft: r.depth * INDENT + 12,
            width: "max-content",
            minWidth: "100%",
          }}
          className={`flex cursor-pointer items-center whitespace-nowrap pr-3 text-xs ${
            selected.has(r.id)
              ? "bg-purple-50 font-medium text-slate-900 shadow-[inset_2px_0_0_var(--color-purple-500)]"
              : r.match
                ? "text-slate-800 hover:bg-slate-50"
                : "text-slate-400 hover:bg-slate-50"
          }`}
        >
          <Label text={r.label} q={r.match ? q : ""} />
        </div>
      ))}
    </div>
  );
}
