import type { Box } from "../../protocol";

const COLORS = {
  hover: { line: "#3b82f6", fill: "rgba(59,130,246,0.06)" },
  selected: { line: "#ad46ff", fill: "rgba(173,70,255,0.08)" },
};

// One outline with its label, drawn over a preview. `s` is the board's zoom, so the
// box follows the preview while the border and label stay the same size.
export default function Outline({
  box,
  s,
  kind,
}: {
  box: Box;
  s: number;
  kind: "hover" | "selected";
}) {
  const { line, fill } = COLORS[kind];
  return (
    <div
      className="absolute box-border pointer-events-none"
      style={{
        left: box.x * s,
        top: box.y * s,
        width: box.w * s,
        height: box.h * s,
        border: `${kind === "hover" ? 1 : 2}px solid ${line}`,
        background: fill,
      }}
    >
      <span
        className="absolute -top-5 left-0 max-w-48 truncate rounded-sm px-1.5 text-[10px] font-medium leading-4 text-white whitespace-nowrap shadow-sm"
        style={{ background: line }}
      >
        {box.label}
      </span>
    </div>
  );
}
