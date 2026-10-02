import { useEffect, useState, useRef } from "react";
import {
  initAgent,
  getIframeError,
  watchIframe,
  onErrorChange,
  retryIframe,
} from "./agent/agent";
import { zoomAt, panBy, type Camera } from "./camera";

interface Screen {
  id: string;
  name: string;
  url: string;
}

function App() {
  const boardRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewErrors, setPreviewErrors] = useState<
    Map<string, string | null>
  >(new Map());
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());
  const [{ x, y, z }, setCamera] = useState<Camera>({ x: 0, y: 0, z: 1 });
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

  // Initialize agent listener immediately
  useEffect(() => {
    const cleanup = initAgent();

    // Agent tells us when an error changes, no polling
    const unsubscribe = onErrorChange(() => {
      const newErrors = new Map<string, string | null>();
      iframeRefs.current.forEach((iframe, screenId) => {
        newErrors.set(screenId, getIframeError(iframe));
      });
      setPreviewErrors(newErrors);
    });

    return () => {
      cleanup?.();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // plain scroll: leave it alone
      e.preventDefault(); // stop the browser's own page zoom
      const rect = element.getBoundingClientRect();
      const px = e.clientX - rect.left; // cursor relative to the board
      const py = e.clientY - rect.top;
      setCamera((c) => zoomAt(c, px, py, c.z * Math.exp(-e.deltaY * 0.01)));
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [loading]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (isPanning) setCamera((c) => panBy(c, e.movementX, e.movementY));
  };
  const endDrag = () => setIsPanning(false);

  return (
    <div className="w-full bg-[#fdfcfa] min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8">Design Tool Viewer</h1>
      {/* Design Board container */}
      <div
        ref={boardRef}
        className="overflow-hidden h-screen touch-none"
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          style={{
            transform: `translate(${x}px,${y}px) scale(${z})`,
            transformOrigin: "0 0",
          }}
          className="w-max"
        >
          <div className="grid grid-cols-4 gap-6">
            {screens.map((screen) => {
              const error = previewErrors.get(screen.id);

              return (
                <div key={screen.id} className="flex flex-col">
                  <h3 className="text-lg font-semibold mb-2">{screen.name}</h3>
                  <div className="relative">
                    <iframe
                      ref={(el) => {
                        if (el) {
                          iframeRefs.current.set(screen.id, el);
                          watchIframe(el);
                        }
                      }}
                      src={screen.url}
                      width="1280"
                      height="800"
                      className={`border border-gray-300 rounded ${isPanning ? "pointer-events-none" : ""}`}
                    />
                    {error && (
                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded">
                        <div className="bg-white p-6 rounded-lg text-center">
                          <p className="text-red-600 font-semibold mb-4">
                            {error}
                          </p>
                          <button
                            onClick={() => {
                              const el = iframeRefs.current.get(screen.id);
                              if (el) retryIframe(el);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                          >
                            Retry
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
