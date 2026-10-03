import { queryAgent } from "./host-bridge";

export interface Row {
  id: string;
  label: string;
  hasChildren: boolean;
}
export interface Node {
  row: Row;
  children: string[];
  expanded: boolean;
  status: "idle" | "loading" | "error";
}

export interface Flat {
  id: string;
  depth: number;
  node: Node;
}

export function flatten(iframe: HTMLIFrameElement): Flat[] {
  const out: Flat[] = [];
  const walk = (id: string, depth: number) => {
    const n = getNode(iframe, id);
    if (!n) return;
    out.push({ id, depth, node: n });
    if (n.expanded) n.children.forEach((c) => walk(c, depth + 1));
  };
  walk(ROOT, 0);
  return out;
}

export const ROOT = "root"; // virtual node above <html>
const blank = (row: Row): Node => ({
  row,
  children: [],
  expanded: false,
  status: "idle",
});

const nodes = new Map<HTMLIFrameElement, Map<string, Node>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
export function onTreeChange(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function table(iframe: HTMLIFrameElement) {
  let t = nodes.get(iframe);
  if (!t)
    nodes.set(
      iframe,
      (t = new Map([
        [ROOT, blank({ id: ROOT, label: "", hasChildren: true })],
      ])),
    );
  return t;
}
export const getNode = (iframe: HTMLIFrameElement, id: string) =>
  table(iframe).get(id);

function upsert(iframe: HTMLIFrameElement, row: Row) {
  const t = table(iframe);
  const n = t.get(row.id);
  if (n)
    n.row = row; // keep expanded + children
  else t.set(row.id, blank(row));
}

export function expand(iframe: HTMLIFrameElement, id: string) {
  const n = getNode(iframe, id);
  if (!n) return;
  n.expanded = true;
  if (n.status === "loading") return; // one request in flight per node
  n.status = "loading";
  notify();
  queryAgent(iframe, "GET_CHILDREN", { from: id === ROOT ? null : id })
    .then((res) => {
      const kids = res.children as Row[] | null;
      if (!kids) throw new Error("gone");
      n.children = kids.map((k) => (upsert(iframe, k), k.id)); // replace, never append
      n.status = "idle";
    })
    .catch(() => {
      n.status = "error";
    }) // only this row fails
    .finally(notify);
}

export function collapse(iframe: HTMLIFrameElement, id: string) {
  const n = getNode(iframe, id);
  if (n) {
    n.expanded = false;
    notify();
  }
}

export async function reveal(iframe: HTMLIFrameElement, id: string) {
  const res = await queryAgent(iframe, "REVEAL", { from: id }); // not `id`: that would overwrite the request id
  const levels = res.levels as { from: string | null; children: Row[] }[] | null;
  if (!levels) return false;
  for (const l of levels) {            // top-down, so each parent exists before its children
    const n = getNode(iframe, l.from ?? ROOT);
    if (!n) continue;
    n.children = l.children.map((k) => (upsert(iframe, k), k.id)); // replace, never append
    n.expanded = true;
    n.status = "idle";
  }
  notify();
  return true;
}

