import { useEffect, useRef, useState, type RefObject } from "react";
import {
  getIframeError,
  onErrorChange,
  retryIframe,
  watchIframe,
} from "../../agent/connection";
import { panBy, zoomAt, type Camera } from "../../camera";
import { Alert } from "../icons";
import { useActiveIframe } from "../useActiveIframe";
import OutlineLayer from "./OutlineLayer";
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
  const [previewErrors, setPreviewErrors] = useState<
    Map<string, string | null>
  >(new Map());
  const active = useActiveIframe();

  // The connection tells us when an error changes, no polling
  useEffect(
    () =>
      onErrorChange(() => {
        const next = new Map<string, string | null>();
        iframeRefs.current.forEach((iframe, screenId) =>
          next.set(screenId, getIframeError(iframe)),
        );
        setPreviewErrors(next);
      }),
    [iframeRefs],
  );

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
    <div className="relative min-w-0 flex-1">
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
              const error = previewErrors.get(screen.id);
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
                    <iframe
                      ref={(el) => {
                        if (el) {
                          iframeRefs.current.set(screen.id, el);
                          watchIframe(el);
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
                    {error && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-md bg-slate-900/60 backdrop-blur-[2px]">
                        <div className="flex max-w-xs flex-col items-center gap-3 rounded-xl bg-white px-6 py-5 text-center shadow-xl">
                          <span className="flex size-9 items-center justify-center rounded-full bg-red-50 text-red-600">
                            <Alert className="size-5" />
                          </span>
                          <p className="text-sm font-medium text-slate-800">
                            {error}
                          </p>
                          <button
                            onClick={() => {
                              const el = iframeRefs.current.get(screen.id);
                              if (el) retryIframe(el);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
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
