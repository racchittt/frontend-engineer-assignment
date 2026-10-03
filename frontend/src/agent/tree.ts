import type { Row } from "../protocol";
import { queryAgent, onIframeReset } from "./connection";

export interface TreeNode {
  row: Row;
  children: string[];
  expanded: boolean;
  status: "idle" | "loading" | "error";
}

export interface Flat {
  id: string;
  depth: number;
  node: TreeNode;
}

export function flatten(iframe: HTMLIFrameElement): Flat[] {
  const out: Flat[] = [];
  const walk = (id: string, depth: number) => {
    const n = getNode(iframe, id);
    if (!n) return;
    out.push({ id, depth, node: n });
    if (n.expanded) n.children.forEach((c) => walk(c, depth + 1));
  };
  // ROOT is not a row: the top rows are the children of <body>
  const root = getNode(iframe, ROOT);
  if (root?.expanded) root.children.forEach((c) => walk(c, 0));
  return out;
}

export const ROOT = "root"; // virtual node above <html>
const blank = (row: Row): TreeNode => ({
  row,
  children: [],
  expanded: false,
  status: "idle",
});

const nodes = new Map<HTMLIFrameElement, Map<string, TreeNode>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// new document in this iframe (navigation or retry): the old ids mean nothing now
onIframeReset((iframe) => {
  nodes.delete(iframe);
  notify();
});
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
      const kids = res.children;
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
  const levels = res.levels;
  if (!levels) return false;
  for (const l of levels) {
    // top-down, so each parent exists before its children
    const n = getNode(iframe, l.from ?? ROOT);
    if (!n) continue;
    n.children = l.children.map((k) => (upsert(iframe, k), k.id)); // replace, never append
    n.expanded = true;
    // A load may still be running for this node. Leave it "loading": its reply
    // replaces the children and sets idle itself. Marking idle here would hide
    // the spinner and let a click send a second request.
    if (n.status !== "loading") n.status = "idle";
  }
  notify();
  return true;
}

export interface Hit {
  screenId: string;
  iframe: HTMLIFrameElement;
  row: Row;
}

// Ask every preview; one slow or dead preview just contributes nothing.
export async function search(
  iframes: Map<string, HTMLIFrameElement>,
  q: string,
): Promise<{ hits: Hit[]; total: number }> {
  const per = await Promise.all(
    [...iframes].map(async ([screenId, iframe]) => {
      try {
        const res = await queryAgent(iframe, "SEARCH", { q });
        return {
          total: res.total,
          hits: res.hits.map((row) => ({ screenId, iframe, row })),
        };
      } catch {
        return { total: 0, hits: [] as Hit[] };
      }
    }),
  );
  return {
    hits: per.flatMap((p) => p.hits),
    total: per.reduce((n, p) => n + p.total, 0),
  };
}
