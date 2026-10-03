import { useEffect, useReducer, useState } from "react";

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

// What GET /elements/:key says about an element. A failure here only affects this section.
export default function DetailsSection({
  elementKey,
}: {
  elementKey: string | null;
}) {
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
