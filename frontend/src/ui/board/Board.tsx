import { useEffect, useRef, useState, type RefObject } from "react";
import {
  onAgentMessage,
  retryIframe,
  watchIframe,
} from "../../agent/connection";
import { panBy, zoomAt, type Camera } from "../../camera";
import { RegionBoundary } from "../RegionBoundary";
import { useActiveIframe } from "../useActiveIframe";
import OutlineLayer from "./OutlineLayer";
import PageErrorBadge from "./PageErrorBadge";
import ZoomControl from "./ZoomControl";

export interface Screen {
  id: string;
  name: string;
  url: string;
}

const GRID = 24; // px between the dots of the canvas, at 100%
const ZOOM_STEP = 1.25; // one press of + or -

// The pannable, zoomable board of previews, with the outlines drawn over it.
export default function Board({
  screens,
  iframeRefs,
}: {
  screens: Screen[];
  iframeRefs: RefObject<Map<string, HTMLIFrameElement>>;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, z: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const active = useActiveIframe();

  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;

    // zoom around a point given in screen pixels
    const zoomWheel = (clientX: number, clientY: number, dy: number) => {
      const rect = element.getBoundingClientRect();
      const px = clientX - rect.left; // cursor relative to the board
      const py = clientY - rect.top;
      setCamera((c) => zoomAt(c, px, py, c.z * Math.exp(-dy * 0.01)));
    };

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return; // plain scroll: leave it alone
      e.preventDefault(); // stop the browser's own page zoom
      zoomWheel(e.clientX, e.clientY, e.deltaY);
    };
    element.addEventListener("wheel", onWheel, { passive: false });

    // Ctrl+wheel over a preview goes to the page, whose agent forwards it. Its x, y are in
    // the page's own pixels: scale them by the preview's on-screen size to get screen pixels.
    const stop = onAgentMessage((iframe, msg) => {
      if (msg.type !== "ZOOM_WHEEL") return;
      const r = iframe.getBoundingClientRect();
      const s = r.width / iframe.offsetWidth;
      zoomWheel(
        r.left + (iframe.clientLeft + msg.x) * s,
        r.top + (iframe.clientTop + msg.y) * s,
        msg.dy,
      );
    });

    return () => {
      element.removeEventListener("wheel", onWheel);
      stop();
    };
  }, []);

  // the zoom buttons zoom around the middle of the visible board
  const zoomBy = (to: (z: number) => number) => {
    const el = boardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setCamera((c) => zoomAt(c, width / 2, height / 2, to(c.z)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (isPanning) setCamera((c) => panBy(c, e.movementX, e.movementY));
  };
  const endDrag = () => setIsPanning(false);

  return (
    <div className="relative min-w-0 flex-1 select-none">
      <div
        ref={boardRef}
        className="h-full touch-none overflow-hidden"
        style={{
          cursor: isPanning ? "grabbing" : "grab",
          // a dot grid that pans and zooms with the board
          backgroundImage:
            "radial-gradient(circle, var(--color-slate-300) 1px, transparent 1px)",
          backgroundSize: `${GRID * camera.z}px ${GRID * camera.z}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          style={{
            transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.z})`,
            transformOrigin: "0 0",
          }}
          className="w-max p-8"
        >
          <div className="grid grid-cols-4 gap-x-8 gap-y-10">
            {screens.map((screen) => {
              const isActive =
                !!active && iframeRefs.current.get(screen.id) === active;

              return (
                <div key={screen.id} className="flex flex-col">
                  <h3
                    className={`mb-2 flex items-center gap-1.5 text-sm ${
                      isActive
                        ? "font-semibold text-slate-900"
                        : "font-medium text-slate-500"
                    }`}
                  >
                    {isActive && (
                      <span
                        title="Active preview"
                        className="size-1.5 rounded-full bg-purple-500"
                      />
                    )}
                    {screen.name}
                  </h3>
                  <div className="relative">
                    {/* each preview is its own region: its error sits on top of it */}
                    <RegionBoundary
                      scope={{ kind: "preview", screenId: screen.id }}
                      cover
                      onRetry={() => {
                        const el = iframeRefs.current.get(screen.id);
                        if (el) retryIframe(el);
                      }}
                    >
                      <iframe
                        ref={(el) => {
                          if (el) {
                            iframeRefs.current.set(screen.id, el);
                            watchIframe(el, screen.id);
                          }
                        }}
                        src={screen.url}
                        title={screen.name}
                        width="1280"
                        height="800"
                        className={`block rounded-md bg-white shadow-lg ring-1 ring-slate-900/10 ${
                          isPanning ? "pointer-events-none" : ""
                        }`}
                      />
                    </RegionBoundary>
                    <PageErrorBadge screenId={screen.id} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <OutlineLayer iframeRefs={iframeRefs} camera={camera} />
      <ZoomControl
        zoom={camera.z}
        onZoomIn={() => zoomBy((z) => z * ZOOM_STEP)}
        onZoomOut={() => zoomBy((z) => z / ZOOM_STEP)}
        onReset={() => zoomBy(() => 1)}
      />
    </div>
  );
}
