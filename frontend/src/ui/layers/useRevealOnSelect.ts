import { useEffect, useRef, type RefObject } from "react";
import { reveal } from "../../agent/tree";
import { getOverlay, onOverlayChange } from "../../agent/overlay";
import { fail, LAYERS } from "../../regions";

// When something is selected in a preview, open its row in the tree.
// `onRevealed(key)` is called once the rows exist, so the panel can scroll to `key`
// ("screenId:elementId").
export function useRevealOnSelect(
  iframeRefs: RefObject<Map<string, HTMLIFrameElement>>,
  onRevealed: (key: string) => void,
) {
  const last = useRef("");
  const callback = useRef(onRevealed);
  useEffect(() => {
    callback.current = onRevealed;
  });

  useEffect(
    () =>
      onOverlayChange(() => {
        // only one preview holds the selection, so look at all of them first
        // (resetting inside the loop would be undone by the other previews)
        let found: [string, HTMLIFrameElement, string] | null = null;
        iframeRefs.current.forEach((iframe, screenId) => {
          const sel = getOverlay(iframe).selected.at(-1);
          if (sel) found = [screenId, iframe, sel.id];
        });
        if (!found) {
          last.current = ""; // so Esc, then reselecting the same element reveals again
          return;
        }
        const [screenId, iframe, id] = found as [
          string,
          HTMLIFrameElement,
          string,
        ];
        const key = `${screenId}:${id}`;
        if (key === last.current) return; // RECT_UPDATE fires a lot
        last.current = key;
        reveal(iframe, id)
          .then((ok) => {
            // a newer selection may have replaced this one while we waited
            if (ok && last.current === key) callback.current(key);
          })
          .catch((err) => {
            if (last.current !== key) return; // a newer selection took over: not a failure
            last.current = ""; // allow another try
            fail(LAYERS, err);
          });
      }),
    [iframeRefs],
  );
}
