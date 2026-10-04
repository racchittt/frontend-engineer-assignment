// Dev only: trigger each failure on demand, for the video. Not in a production build.
import { useState, type RefObject } from "react";
import {
  breakPreview,
  mendPreviews,
  onAgentMessage,
  screenIdOf,
} from "../agent/connection";
import { getActiveIframe } from "../agent/overlay";
import { guard, retry, type Kind, type Scope } from "../regions";
import { clearFaults, setFault } from "./faults";

const boom = () => {
  throw new Error("Injected error");
};

export default function DevMenu({
  iframeRefs,
}: {
  iframeRefs: RefObject<Map<string, HTMLIFrameElement>>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("layers");

  // the preview these act on: the active one, or the first
  const iframe = getActiveIframe() ?? [...iframeRefs.current.values()][0];
  const screenId = iframe ? screenIdOf(iframe) : null;
  const scope: Scope = { kind, screenId: kind === "preview" ? screenId : null };

  // a fault stays on until cleared, so a Retry fails again; `redo` makes it fire now
  const arm = (fault: string, redo?: Scope) => {
    setFault(fault);
    if (redo) retry(redo);
  };

  const items: [string, () => void][] = [
    ["Board: GET /screens fails", () => arm("screens", { kind: "board" })],
    ["Preview: never connects", () => iframe && breakPreview(iframe)],
    ["Layers: render error", () => arm("layersRender", { kind: "layers" })],
    ["Row: next expand fails", () => arm("request:GET_CHILDREN")],
    [
      "Inspector: render error",
      () => arm("inspectorRender", { kind: "inspector" }),
    ],
    [
      "Inspector: live values fail",
      () => arm("request:INSPECT", { kind: "inspector" }),
    ],
    ["Details: request fails", () => arm("details", { kind: "details" })],
    ["Details: bad data", () => arm("detailsBad", { kind: "details" })],
  ];

  // an error thrown somewhere other than drawing, in the region chosen below
  const throwIn: [string, () => void][] = [
    ["a click", guard(scope, boom)],
    [
      "the next key",
      () =>
        window.addEventListener("keydown", guard(scope, boom), { once: true }),
    ],
    [
      "the next preview message",
      () => {
        const off = onAgentMessage(
          guard(scope, () => {
            off();
            boom();
          }),
        );
      },
    ],
    ["a timer", () => void setTimeout(guard(scope, boom), 300)],
    ["a response", () => void Promise.resolve().then(guard(scope, boom))],
  ];

  const btn =
    "w-full rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded border border-dashed border-amber-400 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
      >
        Dev failures
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 space-y-0.5 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          {items.map(([label, run]) => (
            <button key={label} className={btn} onClick={run}>
              {label}
            </button>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <label className="flex items-center gap-2 px-2 py-1 text-xs text-slate-500">
            Throw in
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              className="flex-1 rounded border border-slate-200 bg-white px-1 py-0.5"
            >
              {["board", "preview", "layers", "inspector"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          {throwIn.map(([label, run]) => (
            <button key={label} className={btn} onClick={run}>
              … {label}
            </button>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <button
            className={`${btn} font-medium`}
            onClick={() => {
              clearFaults();
              mendPreviews();
            }}
          >
            Clear all faults
          </button>
        </div>
      )}
    </div>
  );
}
