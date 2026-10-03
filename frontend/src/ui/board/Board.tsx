import { useEffect, useRef, useState, type RefObject } from "react";
import {
  getIframeError,
  onErrorChange,
  retryIframe,
  watchIframe,
} from "../../agent/connection";
import { panBy, zoomAt, type Camera } from "../../camera";
import OutlineLayer from "./OutlineLayer";

export interface Screen {
  id: string;
  name: string;
  url: string;
}

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

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (isPanning) setCamera((c) => panBy(c, e.movementX, e.movementY));
  };
  const endDrag = () => setIsPanning(false);

  return (
    <div className="relative flex-1 min-w-0">
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
            transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.z})`,
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
      <OutlineLayer iframeRefs={iframeRefs} camera={camera} />
    </div>
  );
}
