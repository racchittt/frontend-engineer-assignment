import type { Hit } from "../../agent/tree";
import { Spinner } from "../icons";

// `results` is null while the search is still running
export default function SearchResults({
  results,
  onPick,
}: {
  results: { hits: Hit[]; total: number } | null;
  onPick: (hit: Hit) => void;
}) {
  if (!results)
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500">
        <Spinner className="size-3.5" />
        Searching…
      </div>
    );
  if (results.hits.length === 0)
    return <p className="px-3 py-3 text-xs text-slate-500">No matches</p>;

  return (
    <div className="flex-1 overflow-auto">
      <p className="sticky top-0 border-b border-slate-100 bg-white px-3 py-1.5 text-[11px] text-slate-500">
        {results.total > results.hits.length
          ? `First ${results.hits.length} of ${results.total}, keep typing to narrow`
          : `${results.total} ${results.total === 1 ? "match" : "matches"}`}
      </p>
      {results.hits.map((h) => (
        <button
          key={h.row.id}
          className="block w-full truncate px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-purple-50 hover:text-slate-900"
          onClick={() => onPick(h)}
        >
          {h.row.label}
        </button>
      ))}
    </div>
  );
}
