import { useEffect, useState } from "react";
import { faulty } from "../../dev/faults";
import { clear, fail, useRegion, type Scope } from "../../regions";
import { Skeleton, StatusBadge } from "./parts";

interface Details {
  component: string;
  description: string;
  status: string;
  owner: string;
}
// "none" is a 404 (nothing documented for this key), which is not an error
type Loaded =
  { key: string; state: "none" } | { key: string; state: "ok"; data: Details };

const DETAILS_URL = "http://localhost:4000/elements/";

const isDetails = (d: unknown): d is Details =>
  !!d &&
  ["component", "description", "status", "owner"].every(
    (k) => typeof (d as Record<string, unknown>)[k] === "string",
  );

async function load(key: string, signal: AbortSignal): Promise<Loaded> {
  if (faulty("details"))
    throw new Error("Injected failure: GET /elements/:key");
  const res = await fetch(DETAILS_URL + encodeURIComponent(key), { signal });
  if (res.status === 404) return { key, state: "none" };
  if (!res.ok) throw new Error(`GET /elements/${key} failed (${res.status})`);
  const data: unknown = await res.json();
  if (faulty("detailsBad") || !isDetails(data))
    throw new Error(`GET /elements/${key} returned bad data`);
  return { key, state: "ok", data };
}

// What GET /elements/:key says about an element. It is its own region: a failure here
// shows in this section only, and the Live values above keep working.
export default function DetailsSection({
  elementKey,
  screenId,
}: {
  elementKey: string | null;
  screenId: string | null;
}) {
  const { attempt, error, retry } = useRegion({ kind: "details" });
  const [got, setGot] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!elementKey) return;
    const scope: Scope = { kind: "details", screenId, elementKey };
    clear(scope); // a new request: the last one's error is not this one's
    const ac = new AbortController(); // a newer selection cancels this request
    load(elementKey, ac.signal)
      .then((next) => {
        if (!ac.signal.aborted) setGot(next);
      })
      .catch((err) => {
        // an aborted request is the user moving on: fail() ignores it
        if (!ac.signal.aborted) fail(scope, err, attempt);
      });
    return () => ac.abort();
  }, [elementKey, screenId, attempt]);

  if (!elementKey) return <p className="text-xs text-slate-400">No details</p>;
  if (error && error.elementKey === elementKey)
    return (
      <p className="text-xs">
        <span className="text-red-600">Couldn't load details </span>
        <button className="font-medium underline" onClick={retry}>
          Retry
        </button>
      </p>
    );
  // `got` may belong to an earlier selection: only trust it for this key
  const mine = got?.key === elementKey ? got : null;
  if (!mine) return <Skeleton />;
  if (mine.state === "none")
    return (
      <p className="text-xs text-slate-400">No details for this element</p>
    );
  const d = mine.data;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{d.component}</p>
        <StatusBadge status={d.status} />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        {d.description}
      </p>
      <p className="mt-2 text-[11px] text-slate-500">
        Owner <span className="font-medium text-slate-700">{d.owner}</span>
      </p>
    </div>
  );
}
