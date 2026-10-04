// Dev only: trigger each failure on demand, for the video. Not in a production build.
import { useState, type RefObject } from "react";
import { onAgentMessage, screenIdOf } from "../agent/connection";
import { getActiveIframe } from "../agent/overlay";
import { guard, retry, type Kind, type Scope } from "../regions";
import { clearFaults, toggleFault, useFaults } from "./faults";
import { breakPreview, mendPreviews } from "./previews";

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
  const [target, setTarget] = useState(""); // a screen id, or "" = the active preview
  const on = useFaults(); // which faults are on right now

  // the preview the preview-only items act on
  const screens = [...iframeRefs.current].map(
    ([id, el]) => [id, el.title] as const,
  );
  const iframe = target
    ? iframeRefs.current.get(target)
    : (getActiveIframe() ?? iframeRefs.current.values().next().value);
  const scope: Scope = {
    kind,
    screenId: kind === "preview" && iframe ? screenIdOf(iframe) : null,
  };

  // Each item is a switch. Turning it on (or off) retries its region, so the error
  // appears (or goes) at once instead of at the next request.
  const items: {
    label: string;
    fault: string;
    redo?: Scope;
    onSwitch?: (isOn: boolean) => void;
  }[] = [
    {
      label: "Board: GET /screens fails",
      fault: "screens",
      redo: { kind: "board" },
    },
    {
      label: "Preview: never connects",
      fault: "preview",
      onSwitch: (isOn) => {
        if (isOn && iframe) breakPreview(iframe);
        else mendPreviews();
      },
    },
    {
      label: "Layers: render error",
      fault: "layersRender",
      redo: { kind: "layers" },
    },
    { label: "Row: expand fails", fault: "request:GET_CHILDREN" },
    {
      label: "Inspector: render error",
      fault: "inspectorRender",
      redo: { kind: "inspector" },
    },
    {
      label: "Inspector: live values fail",
      fault: "request:INSPECT",
      redo: { kind: "inspector" },
    },
    {
      label: "Details: request fails",
      fault: "details",
      redo: { kind: "details" },
    },
    {
      label: "Details: bad data",
      fault: "detailsBad",
      redo: { kind: "details" },
    },
  ];

  const flip = (item: (typeof items)[number]) => {
    const isOn = toggleFault(item.fault);
    item.onSwitch?.(isOn);
    if (item.redo) retry(item.redo);
  };

  // an error thrown somewhere other than drawing, in the region chosen below (one-shot)
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
    "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-100";
  const select =
    "flex-1 min-w-0 rounded border border-slate-200 bg-white px-1 py-0.5";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded border border-dashed border-amber-400 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
      >
        Dev failures
        {on.size > 0 && (
          <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">
            {on.size}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 space-y-0.5 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          {items.map((item) => {
            const isOn = on.has(item.fault);
            return (
              <button
                key={item.fault}
                role="switch"
                aria-checked={isOn}
                onClick={() => flip(item)}
                className={`${btn} ${isOn ? "bg-red-50 font-medium text-red-700" : "text-slate-700"}`}
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${isOn ? "bg-red-500" : "border border-slate-300"}`}
                />
                <span className="flex-1">{item.label}</span>
                <span className="text-[10px] tracking-wide">
                  {isOn ? "ON" : "off"}
                </span>
              </button>
            );
          })}
          <label className="flex items-center gap-2 px-2 py-1 text-xs text-slate-500">
            Preview
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={select}
            >
              <option value="">active (or first)</option>
              {screens.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <div className="my-1 border-t border-slate-100" />
          <label className="flex items-center gap-2 px-2 py-1 text-xs text-slate-500">
            Throw in
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              className={select}
            >
              {["board", "preview", "layers", "inspector"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          {throwIn.map(([label, run]) => (
            <button
              key={label}
              className={`${btn} text-slate-700`}
              onClick={run}
            >
              … {label}
            </button>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <button
            className={`${btn} font-medium text-slate-700`}
            onClick={() => {
              clearFaults();
              mendPreviews();
              items.forEach((i) => i.redo && retry(i.redo)); // so the errors go too
            }}
          >
            Switch all off
          </button>
        </div>
      )}
    </div>
  );
}
