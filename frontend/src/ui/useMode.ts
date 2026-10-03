import { useSyncExternalStore } from "react";
import { getMode, onOverlayChange } from "../agent/overlay";

// The current mode ("select" | "interact"), re-rendering when it changes
export const useMode = () => useSyncExternalStore(onOverlayChange, getMode);
