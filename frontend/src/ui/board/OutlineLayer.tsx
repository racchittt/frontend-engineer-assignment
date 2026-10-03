import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  getOverlay,
  onOverlayChange,
  type OverlayData,
} from "../../agent/overlay";
import type { Camera } from "../../camera";
import type { Box } from "../../protocol";
import { useMode } from "../useMode";
import Outline from "./Outline";

// One preview's outlines, placed over the preview's visible area (screen pixels)
interface Group {
  left: number;
  top: number;
  w: number;
  h: number;
  s: number;
  hover: Box | null;
  selected: Box[];
}

// Draws hover and selection outlines over every preview. Outlines are only drawn in Select mode.
export default function OutlineLayer({
  iframeRefs,
  camera,
}: {
  iframeRefs: RefObject<Map<string, HTMLIFrameElement>>;
  camera: Camera;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState<Map<string, OverlayData>>(new Map());
  const [groups, setGroups] = useState<Group[]>([]);
  const mode = useMode();

  useEffect(
    () =>
      onOverlayChange(() => {
        const next = new Map<string, OverlayData>();
        iframeRefs.current.forEach((iframe, id) =>
          next.set(id, getOverlay(iframe)),
        );
        setOverlay(next);
      }),
    [iframeRefs],
  );

  // Where each preview is on screen. Runs again when the camera moves.
  useLayoutEffect(() => {
    const host = layerRef.current;
    if (!host) return;
    const o = host.getBoundingClientRect();
    const next: Group[] = [];
    overlay.forEach((data, id) => {
      const iframe = iframeRefs.current.get(id);
      if (!iframe) return;
      const r = iframe.getBoundingClientRect(); // screen rect, already scaled by the camera
      const s = r.width / iframe.offsetWidth;
      next.push({
        left: r.left - o.left + iframe.clientLeft * s,
        top: r.top - o.top + iframe.clientTop * s,
        w: iframe.clientWidth * s,
        h: iframe.clientHeight * s,
        s,
        ...data,
      });
    });
    setGroups(next);
  }, [overlay, camera, iframeRefs]);

  return (
    <div
      ref={layerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
    >
      {mode === "select" &&
        groups.map((g, i) => (
          <div
            key={i}
            className="absolute overflow-hidden"
            style={{ left: g.left, top: g.top, width: g.w, height: g.h }}
          >
            {g.hover && g.hover.w > 0 && (
              <Outline box={g.hover} s={g.s} kind="hover" />
            )}
            {g.selected
              .filter((b) => b.w > 0 && b.h > 0)
              .map((b) => (
                <Outline key={b.id} box={b} s={g.s} kind="selected" />
              ))}
          </div>
        ))}
    </div>
  );
}
