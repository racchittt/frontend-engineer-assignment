// Dev only: failures on demand (see DevMenu). A fault stays on until it is switched off, so
// a Retry that fails again shows up as a new failure. Several can be on at once. In a
// production build nothing is ever on.
import { useSyncExternalStore } from "react";

let on = new Set<string>(); // replaced, never changed, so React sees each change
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const set = (next: Set<string>) => {
  on = next;
  listeners.forEach((l) => l());
};

export const faulty = (name: string) => import.meta.env.DEV && on.has(name);
export const useFaults = () => useSyncExternalStore(subscribe, () => on);

// flips one fault; returns whether it is on now
export function toggleFault(name: string) {
  const next = new Set(on);
  if (!next.delete(name)) next.add(name);
  set(next);
  return next.has(name);
}
export const clearFaults = () => set(new Set());
