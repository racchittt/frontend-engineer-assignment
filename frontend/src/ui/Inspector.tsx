import { useEffect, useReducer, useState } from "react";
import {
  getSelection,
  onOverlayChange,
  queryAgent,
  wasSelectionLost,
} from "../agent/host-bridge";

interface Live {
  name: string;
  tag: string;
  id: string;
  classes: string;
  size: string;
  position: string;
  text: string;
  color: string;
  background: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  key: string | null;
}
const FIELDS: [keyof Live, string][] = [
  ["name", "Name"],
  ["tag", "Tag"],
  ["id", "Id"],
  ["classes", "Classes"],
  ["size", "Size"],
  ["position", "Position"],
  ["text", "Text"],
  ["color", "Text colour"],
  ["background", "Background"],
  ["fontFamily", "Font family"],
  ["fontSize", "Font size"],
  ["fontWeight", "Font weight"],
];

interface Details {
  component: string;
  description: string;
  status: string;
  owner: string;
}
// "none" is a 404 (nothing documented for this key), which is not an error
type DetailsState =
  | { key: string; state: "none" }
  | { key: string; state: "error" }
  | { key: string; state: "ok"; data: Details };

const DETAILS_URL = "http://localhost:4000/elements/";

const isDetails = (d: unknown): d is Details =>
  !!d &&
  ["component", "description", "status", "owner"].every(
    (k) => typeof (d as Record<string, unknown>)[k] === "string",
  );

function DetailsSection({ elementKey }: { elementKey: string | null }) {
  const [got, setGot] = useState<DetailsState | null>(null);
  const [attempt, retry] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!elementKey) return;
    const ac = new AbortController(); // a newer selection cancels this request
    fetch(DETAILS_URL + encodeURIComponent(elementKey), { signal: ac.signal })
      .then(async (res): Promise<DetailsState> => {
        if (res.status === 404) return { key: elementKey, state: "none" };
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data: unknown = await res.json();
        if (!isDetails(data)) throw new Error("bad data");
        return { key: elementKey, state: "ok", data };
      })
      .catch((err): DetailsState | null =>
        err.name === "AbortError" ? null : { key: elementKey, state: "error" },
      )
      .then((next) => {
        if (next && !ac.signal.aborted) setGot(next);
      });
    return () => ac.abort();
  }, [elementKey, attempt]);

  if (!elementKey) return <p className="text-gray-500">No details</p>;
  // `got` may belong to an earlier selection: only trust it for this key
  const mine = got?.key === elementKey ? got : null;
  if (!mine) return <p className="text-gray-500">Loading…</p>;
  if (mine.state === "none")
    return <p className="text-gray-500">No details for this element</p>;
  if (mine.state === "error")
    return (
      <p>
        <span className="text-red-600">Couldn't load details </span>
        <button className="underline" onClick={retry}>
          Retry
        </button>
      </p>
    );
  const d = mine.data;
  return (
    <dl className="grid grid-cols-[80px_1fr] gap-x-2">
      <dt className="text-gray-500">Component</dt>
      <dd>{d.component}</dd>
      <dt className="text-gray-500">Description</dt>
      <dd>{d.description}</dd>
      <dt className="text-gray-500">Status</dt>
      <dd>{d.status}</dd>
      <dt className="text-gray-500">Owner</dt>
      <dd>{d.owner}</dd>
    </dl>
  );
}

const Inspector = () => {
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => onOverlayChange(bump), []);

  const sel = getSelection();
  const boxes = sel?.boxes;
  const iframe = sel?.iframe;

  // `for` ties a reply to the selection it was asked for, so a late one is never shown
  const [live, setLive] = useState<{
    for: unknown;
    lives: (Live | null)[] | null;
  } | null>(null);
  const [attempt, retry] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!boxes || !iframe) return;
    let stale = false;
    queryAgent(iframe, "INSPECT", { ids: boxes.map((b) => b.id) })
      .then((res) => {
        if (!stale)
          setLive({ for: boxes, lives: res.lives as (Live | null)[] });
      })
      .catch(() => {
        if (!stale) setLive({ for: boxes, lives: null });
      });
    return () => {
      stale = true;
    };
  }, [boxes, iframe, attempt]);

  let body;
  if (!boxes) {
    body = (
      <p className="text-gray-500">
        {wasSelectionLost()
          ? "This element no longer exists"
          : "Nothing selected"}
      </p>
    );
  } else if (live?.for !== boxes) {
    body = <p className="text-gray-500">Loading…</p>;
  } else if (!live.lives) {
    body = (
      <p>
        <span className="text-red-600">Couldn't read this element </span>
        <button className="underline" onClick={retry}>
          Retry
        </button>
      </p>
    );
  } else {
    const lives = live.lives.filter((l): l is Live => l !== null);
    const one = lives.length === 1 && boxes.length === 1;
    body = (
      <>
        {boxes.length > 1 && (
          <p className="font-semibold">{boxes.length} elements</p>
        )}
        <dl className="grid grid-cols-[80px_1fr] gap-x-2 break-words">
          {FIELDS.map(([field, label]) => {
            const values = new Set(lives.map((l) => l[field]));
            return (
              <div key={field} className="contents">
                <dt className="text-gray-500">{label}</dt>
                <dd>{values.size > 1 ? "Mixed" : ([...values][0] ?? "")}</dd>
              </div>
            );
          })}
        </dl>
        {one && (
          <>
            <h3 className="font-semibold mt-3 mb-1">Details</h3>
            <DetailsSection elementKey={lives[0].key} />
          </>
        )}
      </>
    );
  }

  return (
    <div className="w-72 shrink-0 h-screen overflow-auto px-2 text-sm">
      <h2 className="font-semibold mb-1">Inspector</h2>
      {body}
    </div>
  );
};

export default Inspector;
