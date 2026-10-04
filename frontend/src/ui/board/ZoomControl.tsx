import type { ReactNode } from "react";
import { MAX_Z, MIN_Z } from "../../camera";
import { Minus, Plus } from "../icons";

function Step({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:text-slate-300"
    >
      {children}
    </button>
  );
}

// Zoom out, the current zoom (click it to go back to 100%), zoom in.
// Ctrl/Cmd + wheel still zooms around the pointer.
export default function ZoomControl({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Zoom"
      className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg bg-white p-0.5 shadow-md ring-1 ring-slate-900/10"
    >
      <Step
        label="Zoom out"
        disabled={zoom <= MIN_Z + 1e-6}
        onClick={onZoomOut}
      >
        <Minus className="size-3.5" />
      </Step>
      <button
        onClick={onReset}
        title="Reset to 100%"
        className="h-7 min-w-12 rounded-md px-1.5 font-mono text-[11px] text-slate-700 hover:bg-slate-100"
      >
        {Math.round(zoom * 100)}%
      </button>
      <Step label="Zoom in" disabled={zoom >= MAX_Z - 1e-6} onClick={onZoomIn}>
        <Plus className="size-3.5" />
      </Step>
    </div>
  );
}
