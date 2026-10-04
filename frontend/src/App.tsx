import { useEffect, useRef, useState } from "react";
import { initAgent } from "./agent/connection";
import DevMenu from "./dev/DevMenu";
import { faulty } from "./dev/faults";
import { BOARD, INSPECTOR, LAYERS, fail, useRegion } from "./regions";
import Board, { type Screen } from "./ui/board/Board";
import { Spinner } from "./ui/icons";
import Inspector from "./ui/inspector/Inspector";
import LayersPanel from "./ui/layers/LayersPanel";
import { RegionBoundary } from "./ui/RegionBoundary";
import Toolbar from "./ui/Toolbar";
import { useShortcuts } from "./ui/useShortcuts";

const isScreens = (d: unknown): d is Screen[] =>
  Array.isArray(d) &&
  d.every((s) =>
    ["id", "name", "url"].every((k) => typeof s?.[k] === "string"),
  );

async function loadScreens(): Promise<Screen[]> {
  if (faulty("screens")) throw new Error("Injected failure: GET /screens");
  const res = await fetch("http://localhost:4000/screens");
  if (!res.ok) throw new Error(`GET /screens failed (${res.status})`);
  const data: unknown = await res.json();
  if (!isScreens(data)) throw new Error("GET /screens returned bad data");
  return data;
}

function App() {
  const { attempt } = useRegion(BOARD);
  const [loaded, setLoaded] = useState<{
    attempt: number;
    screens: Screen[];
  } | null>(null);
  // every preview's iframe, by screen id. Filled as the iframes mount.
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());

  useShortcuts();

  useEffect(() => {
    let stale = false;
    loadScreens()
      .then((screens) => {
        if (!stale) setLoaded({ attempt, screens });
      })
      .catch((err) => {
        if (stale) return;
        fail(BOARD, err, attempt);
        setLoaded({ attempt, screens: [] });
      });
    return () => {
      stale = true;
    };
  }, [attempt]);

  // Listen for the previews' hello messages immediately, before the iframes load
  useEffect(() => initAgent(), []);

  const loading = loaded?.attempt !== attempt;
  const screens = loaded?.screens ?? [];

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
          {import.meta.env.DEV && <DevMenu iframeRefs={iframeRefs} />}
        </div>
        <Toolbar />
      </header>
      <div className="flex min-h-0 flex-1">
        {/* each of these is a region: if one breaks, the others keep working */}
        <RegionBoundary
          scope={LAYERS}
          className="h-full w-72 shrink-0 border-r border-slate-200 bg-white"
        >
          <LayersPanel iframeRefs={iframeRefs} />
        </RegionBoundary>
        <RegionBoundary scope={BOARD} className="min-w-0 flex-1 bg-slate-50">
          {loading ? (
            <div className="flex h-full min-w-0 flex-1 items-center justify-center gap-2 text-sm text-slate-500">
              <Spinner className="size-4" />
              Loading screens…
            </div>
          ) : (
            <Board screens={screens} iframeRefs={iframeRefs} />
          )}
        </RegionBoundary>
        <RegionBoundary
          scope={INSPECTOR}
          className="h-full w-72 shrink-0 border-l border-slate-200 bg-white"
        >
          <Inspector />
        </RegionBoundary>
      </div>
    </div>
  );
}

export default App;
