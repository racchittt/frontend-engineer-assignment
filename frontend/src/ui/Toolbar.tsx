import type { ReactNode } from "react";
import { setMode } from "../agent/overlay";
import { Cursor, Hand } from "./icons";
import { useMode } from "./useMode";

function Option({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  hint: string; // the keyboard shortcut
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/10"
          : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {icon}
      {label}
      <kbd
        className={`rounded border px-1 font-mono text-[10px] leading-4 ${
          active
            ? "border-slate-200 text-slate-500"
            : "border-slate-300/70 text-slate-400"
        }`}
      >
        {hint}
      </kbd>
    </button>
  );
}

// Select mode: clicks pick elements. Interact mode: the pages behave normally.
export default function Toolbar() {
  const mode = useMode();
  return (
    <div
      role="group"
      aria-label="Mode"
      className="flex gap-0.5 rounded-lg bg-slate-200/70 p-0.5"
    >
      <Option
        active={mode === "select"}
        onClick={() => setMode("select")}
        icon={<Cursor className="size-3.5" />}
        label="Select"
        hint="V"
      />
      <Option
        active={mode === "interact"}
        onClick={() => setMode("interact")}
        icon={<Hand className="size-3.5" />}
        label="Interact"
        hint="I"
      />
    </div>
  );
}
