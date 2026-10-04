import { useSyncExternalStore } from "react";
import { getActiveIframe, onOverlayChange } from "../agent/overlay";

// The preview last picked in Select mode, re-rendering when it changes
export const useActiveIframe = () =>
  useSyncExternalStore(onOverlayChange, getActiveIframe);
