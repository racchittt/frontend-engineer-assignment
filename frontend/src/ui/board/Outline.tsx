import type { Box } from "../../protocol";

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
  const color = kind === "hover" ? "#3b82f6" : "#f97316";
  return (
    <div
      className="absolute box-border pointer-events-none"
      style={{
        left: box.x * s,
        top: box.y * s,
        width: box.w * s,
        height: box.h * s,
        border: `${kind === "hover" ? 1 : 2}px solid ${color}`,
      }}
    >
      <span
        className="absolute -top-5 left-0 text-[10px] px-1 text-white whitespace-nowrap"
        style={{ background: color }}
      >
        {box.label}
      </span>
    </div>
  );
}
