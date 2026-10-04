import { useEffect, useRef, useState } from "react";
import { initAgent } from "./agent/connection";
import Board, { type Screen } from "./ui/board/Board";
import { Spinner } from "./ui/icons";
import Inspector from "./ui/inspector/Inspector";
import LayersPanel from "./ui/layers/LayersPanel";
import Toolbar from "./ui/Toolbar";
import { useShortcuts } from "./ui/useShortcuts";

function App() {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [loading, setLoading] = useState(true);
  // every preview's iframe, by screen id. Filled as the iframes mount.
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());

  useShortcuts();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("http://localhost:4000/screens");
        const data = await res.json();
        setScreens(data);
        console.log(`Loaded ${data.length} screens`);
      } catch (err) {
        console.error("Failed to load screens:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Listen for the previews' hello messages immediately, before the iframes load
  useEffect(() => initAgent(), []);

  if (loading)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
        <Spinner className="size-4" />
        Loading screens…
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold tracking-tight">
            Design Tool Viewer
          </h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
            {screens.length} screens
          </span>
        </div>
        <Toolbar />
      </header>
      <div className="flex min-h-0 flex-1">
        <LayersPanel iframeRefs={iframeRefs} screens={screens} />
        <Board screens={screens} iframeRefs={iframeRefs} />
        <Inspector />
      </div>
    </div>
  );
}

export default App;
