import { useEffect, useState } from "react";
import { queryAgent, screenIdOf } from "../../agent/connection";
import type { Box, Live } from "../../protocol";
import { attemptOf, fail, INSPECTOR, type Scope } from "../../regions";

// Live values (read from the page) for the selected elements. Asks again whenever
// `boxes` is a new array, which is when the selection or its rects changed. A failed
// request fails the inspector region.
export function useLiveValues(
  boxes: Box[] | undefined,
  iframe: HTMLIFrameElement | undefined,
) {
  // `for` ties a reply to the selection it was asked for, so a late one is never shown
  const [live, setLive] = useState<{
    for: unknown;
    lives: (Live | null)[];
  } | null>(null);

  useEffect(() => {
    if (!boxes || !iframe) return;
    let stale = false; // the selection changed (or the inspector went away): not a failure
    const scope: Scope = { ...INSPECTOR, screenId: screenIdOf(iframe) };
    const at = attemptOf(scope);
    queryAgent(iframe, "INSPECT", { ids: boxes.map((b) => b.id) })
      .then((res) => {
        if (!stale) setLive({ for: boxes, lives: res.lives });
      })
      .catch((err) => {
        if (!stale) fail(scope, err, at);
      });
    return () => {
      stale = true;
    };
  }, [boxes, iframe]);

  const mine = live && live.for === boxes ? live : null; // a reply for an older selection doesn't count
  return { loading: !mine, lives: mine?.lives ?? null };
}
