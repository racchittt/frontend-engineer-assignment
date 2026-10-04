// Dev only: failures on demand (see DevMenu). A fault stays on until cleared, so a Retry
// that fails again shows up as a new failure. In a production build nothing is ever on.
const on = new Set<string>();

export const faulty = (name: string) => import.meta.env.DEV && on.has(name);
export const setFault = (name: string) => on.add(name);
export const clearFaults = () => on.clear();
