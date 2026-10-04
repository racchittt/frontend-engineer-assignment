// Dev only: a preview whose page never answers, for the fault menu
import { retryIframe } from "../agent/connection";

const DEAD_URL = "http://localhost:4001/__dead__";

export function breakPreview(iframe: HTMLIFrameElement) {
  iframe.dataset.good ??= iframe.getAttribute("src") ?? "";
  iframe.setAttribute("src", DEAD_URL);
  retryIframe(iframe);
}

export function mendPreviews() {
  document.querySelectorAll("iframe").forEach((iframe) => {
    if (!iframe.dataset.good) return;
    iframe.setAttribute("src", iframe.dataset.good);
    delete iframe.dataset.good;
    retryIframe(iframe);
  });
}
