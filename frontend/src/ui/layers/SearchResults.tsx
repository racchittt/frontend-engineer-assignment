import type { Hit } from "../../agent/tree";

// `results` is null while the search is still running
export default function SearchResults({
  results,
  onPick,
}: {
  results: { hits: Hit[]; total: number } | null;
  onPick: (hit: Hit) => void;
}) {
  return (
    <div className="flex-1 overflow-auto text-sm">
      {!results && <div className="px-2">Searching…</div>}
      {results?.hits.length === 0 && <div className="px-2">No matches</div>}
      {results?.hits.map((h) => (
        <button
          key={`${h.screenId}:${h.row.id}`}
          className="block w-full text-left px-2 truncate hover:bg-orange-100"
          onClick={() => onPick(h)}
        >
          {h.row.label}
        </button>
      ))}
      {results && results.total > results.hits.length && (
        <div className="px-2 text-gray-500">
          first {results.hits.length} of {results.total}, keep typing to narrow
        </div>
      )}
    </div>
  );
}
