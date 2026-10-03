import { useEffect, useRef, useState } from "react";
import { initAgent } from "./agent/connection";
import Board, { type Screen } from "./ui/board/Board";
import Inspector from "./ui/Inspector";
import LayersPanel from "./ui/LayersPanel";
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
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );

  return (
    <div className="w-full bg-[#fdfcfa] min-h-screen p-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-4xl font-bold mb-8">Design Tool Viewer</h1>
        <Toolbar />
      </div>
      <div className="flex">
        <LayersPanel iframeRefs={iframeRefs} />
        <Board screens={screens} iframeRefs={iframeRefs} />
        <Inspector />
      </div>
    </div>
  );
}

export default App;
