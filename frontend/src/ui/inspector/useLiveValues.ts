import { useEffect, useReducer, useState } from "react";
import { queryAgent } from "../../agent/connection";
import type { Box, Live } from "../../protocol";

// Live values (read from the page) for the selected elements. Asks again whenever
// `boxes` is a new array, which is when the selection or its rects changed.
export function useLiveValues(
  boxes: Box[] | undefined,
  iframe: HTMLIFrameElement | undefined,
) {
  // `for` ties a reply to the selection it was asked for, so a late one is never shown
  const [live, setLive] = useState<{
    for: unknown;
    lives: (Live | null)[] | null; // null = the request failed
  } | null>(null);
  const [attempt, retry] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!boxes || !iframe) return;
    let stale = false;
    queryAgent(iframe, "INSPECT", { ids: boxes.map((b) => b.id) })
      .then((res) => {
        if (!stale) setLive({ for: boxes, lives: res.lives });
      })
      .catch(() => {
        if (!stale) setLive({ for: boxes, lives: null });
      });
    return () => {
      stale = true;
    };
  }, [boxes, iframe, attempt]);

  const mine = live && live.for === boxes ? live : null; // a reply for an older selection doesn't count
  return {
    loading: !mine,
    failed: !!mine && !mine.lives,
    lives: mine?.lives ?? null,
    retry,
  };
}
