import { setMode } from "../agent/overlay";
import { useMode } from "./useMode";

export default function Toolbar() {
  const mode = useMode();
  return (
    <div className="flex gap-2 mb-4">
      <button
        onClick={() => setMode("select")}
        className={mode === "select" ? "font-bold" : ""}
      >
        Select (V)
      </button>
      <button
        onClick={() => setMode("interact")}
        className={mode === "interact" ? "font-bold" : ""}
      >
        Interact (I)
      </button>
    </div>
  );
}
