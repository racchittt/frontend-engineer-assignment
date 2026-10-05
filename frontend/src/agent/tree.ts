import type { Row } from "../protocol";
import {
  attemptOf,
  dropRows,
  fail,
  isCancel,
  retry,
  type Scope,
} from "../regions";
import {
  onAgentMessage,
  onIframeReset,
  postToAgent,
  queryAgent,
  screenIdOf,
} from "./connection";

export interface TreeNode {
  row: Row;
  children: string[];
  expanded: boolean;
  status: "idle" | "loading" | "error";
  dirty?: boolean; // the page changed this node's children while its load was running
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
  dropRows(screenIdOf(iframe));
  nodes.delete(iframe);
  lastKept.delete(iframe);
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

// Tell the agent which rows are open, so it can follow them if the page rebuilds its DOM
// (an open row keeps its place and its open state, instead of coming back closed).
const lastKept = new Map<HTMLIFrameElement, string>();
function syncKept(iframe: HTMLIFrameElement) {
  const ids = [...table(iframe)]
    .filter(([id, n]) => id !== ROOT && n.expanded)
    .map(([id]) => id)
    .sort();
  const key = ids.join(",");
  if (lastKept.get(iframe) === key) return;
  lastKept.set(iframe, key);
  postToAgent(iframe, { type: "KEEP", ids });
}

// Each row's child loading is its own region, so one row failing touches nothing else
const rowScope = (iframe: HTMLIFrameElement, id: string): Scope => ({
  kind: "layers-row",
  screenId: screenIdOf(iframe),
  row: id,
});

// Drop rows the page removed, and everything under them
function prune(iframe: HTMLIFrameElement, ids: string[]) {
  const t = table(iframe);
  const drop = (id: string) => {
    t.get(id)?.children.forEach(drop);
    t.delete(id);
  };
  ids.forEach(drop);
}

// The page changed these parents' children. Re-read the ones that are open and replace
// their children: rows that are still there keep their own state, the others drop out.
function refresh(iframe: HTMLIFrameElement, parents: (string | null)[]) {
  for (const parent of parents) {
    const n = getNode(iframe, parent ?? ROOT);
    if (!n || !n.expanded) continue; // closed rows read fresh when they are opened
    if (n.status === "loading") {
      n.dirty = true; // its reply may already be out of date: read again when it lands
      continue;
    }
    const scope = rowScope(iframe, parent ?? ROOT);
    const at = attemptOf(scope);
    const gone = () => getNode(iframe, parent ?? ROOT) !== n; // the page was replaced
    queryAgent(iframe, "GET_CHILDREN", { from: parent })
      .then((res) => {
        if (gone()) return;
        if (!res.children) return; // the parent itself is gone: its own parent refreshes
        const next = res.children.map((k) => (upsert(iframe, k), k.id));
        prune(
          iframe,
          n.children.filter((c) => !next.includes(c)),
        );
        n.children = next;
        n.row.hasChildren = next.length > 0;
        syncKept(iframe);
        notify();
      })
      .catch((err) => {
        if (isCancel(err) || gone()) return;
        n.status = "error"; // shown on the row, with a Retry
        fail(scope, err, at);
        notify();
      });
  }
}

onAgentMessage((iframe, msg) => {
  if (msg.type === "CHILDREN_CHANGED") refresh(iframe, msg.ids);
});

export function expand(iframe: HTMLIFrameElement, id: string) {
  const n = getNode(iframe, id);
  if (!n) return;
  n.expanded = true;
  syncKept(iframe);
  if (n.status === "loading") return; // one request in flight per node
  n.status = "loading";
  notify();
  const scope = rowScope(iframe, id);
  const at = attemptOf(scope);
  const gone = () => getNode(iframe, id) !== n; // the page was replaced
  queryAgent(iframe, "GET_CHILDREN", { from: id === ROOT ? null : id })
    .then((res) => {
      if (gone()) return;
      const kids = res.children;
      if (!kids) throw new Error("gone");
      n.children = kids.map((k) => (upsert(iframe, k), k.id)); // replace, never append
      n.status = "idle";
    })
    .catch((err) => {
      if (isCancel(err) || gone()) return; // not a failure, or nobody is looking
      n.status = "error";
      fail(scope, err, at); // only this row fails
    })
    .finally(() => {
      notify();
      if (n.dirty) {
        n.dirty = false;
        refresh(iframe, [id === ROOT ? null : id]);
      }
    });
}

// Retry button on a row: a new attempt, so a second failure shows and reports again
export function retryRow(iframe: HTMLIFrameElement, id: string) {
  retry(rowScope(iframe, id));
  expand(iframe, id);
}

export function collapse(iframe: HTMLIFrameElement, id: string) {
  const n = getNode(iframe, id);
  if (n) {
    n.expanded = false;
    syncKept(iframe);
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
  syncKept(iframe);
  notify();
  return true;
}
