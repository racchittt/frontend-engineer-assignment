import { useEffect, useReducer } from "react";
import type { Live } from "../../protocol";
import {
  getSelection,
  onOverlayChange,
  wasSelectionLost,
} from "../../agent/overlay";
import DetailsSection from "./DetailsSection";
import { useLiveValues } from "./useLiveValues";

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

// What is selected: its live values, and (for one element) what the API says about it.
const Inspector = () => {
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => onOverlayChange(bump), []);

  const sel = getSelection();
  const boxes = sel?.boxes;
  const { loading, failed, lives, retry } = useLiveValues(boxes, sel?.iframe);

  let body;
  if (!boxes) {
    body = (
      <p className="text-gray-500">
        {wasSelectionLost()
          ? "This element no longer exists"
          : "Nothing selected"}
      </p>
    );
  } else if (loading) {
    body = <p className="text-gray-500">Loading…</p>;
  } else if (failed || !lives) {
    body = (
      <p>
        <span className="text-red-600">Couldn't read this element </span>
        <button className="underline" onClick={retry}>
          Retry
        </button>
      </p>
    );
  } else {
    const found = lives.filter((l): l is Live => l !== null);
    const one = found.length === 1 && boxes.length === 1;
    body = (
      <>
        {boxes.length > 1 && (
          <p className="font-semibold">{boxes.length} elements</p>
        )}
        <dl className="grid grid-cols-[80px_1fr] gap-x-2 break-words">
          {FIELDS.map(([field, label]) => {
            // several elements: the value they all share, or "Mixed"
            const values = new Set(found.map((l) => l[field]));
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
            <DetailsSection elementKey={found[0].key} />
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
