import { useEffect, useRef, useState } from "react";
import { search, type Hit } from "../../agent/tree";
import { guard, LAYERS } from "../../regions";

// Search the active preview. The agent scans its whole DOM, because the tree only has
// the rows that were loaded. Returns null while the answer for `query` is still on its way.
export function useSearch(
  query: string,
  active: HTMLIFrameElement | null,
  activeId: string | undefined,
) {
  const [found, setFound] = useState<{
    q: string;
    hits: Hit[];
    total: number;
  } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current; // bumped on every change, so an older reply can't land late
    if (!query || !active || !activeId) return;
    const t = setTimeout(() => {
      guard(LAYERS, () =>
        search(new Map([[activeId, active]]), query).then(
          (r) => {
            if (mine === seq.current) setFound({ q: query, ...r });
          },
          (e) => {
            // a search the user typed past is not a failure
            if (mine === seq.current) throw e;
          },
        ),
      )();
    }, 250); // debounce
    return () => clearTimeout(t);
  }, [query, active, activeId]);

  return query && found?.q === query ? found : null;
}
