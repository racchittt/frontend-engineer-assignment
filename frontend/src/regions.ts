// Failures. A region is one part of the app that can fail on its own: the board, a preview,
// the layers panel, one row's children, the inspector, its Details section. Each has an
// attempt counter and at most one error showing. `fail` reports to report() once per
// failure, and a retry starts a new attempt, so a second failure shows and reports again.
import { useSyncExternalStore } from "react";
import { report } from "../report";

export type Kind =
  "board" | "preview" | "layers" | "layers-row" | "details" | "inspector";

export interface Scope {
  kind: Kind;
  screenId?: string | null;
  row?: string; // layers-row: which element's children
  elementKey?: string | null; // details: which element (its data-key)
}

export const BOARD: Scope = { kind: "board" };
export const LAYERS: Scope = { kind: "layers" };
export const INSPECTOR: Scope = { kind: "inspector" };

interface State {
  attempt: number;
  error: { message: string; elementKey: string | null } | null;
}

const IDLE: State = { attempt: 0, error: null };
const states = new Map<string, State>();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const notify = () => listeners.forEach((l) => l());

// One region per kind, except previews and rows: there is one per screen (and row).
// `screenId` on the others is only for report().
const idOf = (s: Scope) =>
  s.kind === "preview" || s.kind === "layers-row"
    ? `${s.kind}:${s.screenId ?? ""}:${s.row ?? ""}`
    : s.kind;
const read = (s: Scope) => states.get(idOf(s)) ?? IDLE;

export const attemptOf = (s: Scope) => read(s).attempt;

// ---- what is not a failure ----
// A request that was cancelled or replaced because the user moved on (or the page was
// replaced) is not a failure: nothing is shown and nothing is reported.
export class Cancelled extends Error {}
export const isCancel = (e: unknown) =>
  e instanceof Cancelled ||
  (e instanceof DOMException && e.name === "AbortError");

// ---- failing and retrying ----
// `at` is the attempt the work started in. If the region was retried since, this is an
// answer to a question nobody is asking any more: ignore it.
export function fail(scope: Scope, error: unknown, at = attemptOf(scope)) {
  if (isCancel(error)) return;
  const cur = read(scope);
  if (at !== cur.attempt) return;
  const elementKey = scope.elementKey ?? null;
  if (cur.error && cur.error.elementKey === elementKey) return; // already shown, already reported
  const message = error instanceof Error ? error.message : String(error);
  states.set(idOf(scope), {
    attempt: cur.attempt,
    error: { message, elementKey },
  });
  notify();
  report(error, {
    region: scope.kind,
    screenId: scope.screenId ?? null,
    ...(scope.elementKey ? { elementKey: scope.elementKey } : {}),
  });
}

// Forget a shown error without a new attempt: its work is being redone
export function clear(scope: Scope) {
  const cur = read(scope);
  if (!cur.error) return;
  states.set(idOf(scope), { attempt: cur.attempt, error: null });
  notify();
}

// A new attempt: clears the error, and failures of the old attempt no longer count
export function retry(scope: Scope) {
  states.set(idOf(scope), { attempt: read(scope).attempt + 1, error: null });
  notify();
}

// A preview's document was replaced: its rows' states mean nothing now
export function dropRows(screenId: string | null) {
  const prefix = `layers-row:${screenId ?? ""}:`;
  [...states.keys()]
    .filter((k) => k.startsWith(prefix))
    .forEach((k) => states.delete(k));
  notify();
}

export function useRegion(scope: Scope) {
  const { attempt, error } = useSyncExternalStore(subscribe, () => read(scope));
  return { attempt, error, retry: () => retry(scope) };
}

// Wrap a handler, a timer, a message listener or a promise continuation: if it throws
// (or rejects), the region fails instead of the error getting lost.
export function guard<A extends unknown[], R>(
  scope: Scope,
  fn: (...args: A) => R,
): (...args: A) => R | undefined {
  return (...args) => {
    const at = attemptOf(scope);
    try {
      const out = fn(...args);
      if (out instanceof Promise)
        return out.catch((e) => fail(scope, e, at)) as R;
      return out;
    } catch (e) {
      fail(scope, e, at);
    }
  };
}

// ---- errors inside a page: a badge on that preview, not a region error ----
// The preview still works, so nothing is covered. Each distinct message is reported once
// per document.
const pageErrors = new Map<string, string>();
const pageSeen = new Map<string, Set<string>>();

export function pageError(screenId: string | null, message: string) {
  if (!screenId) return;
  const seen = pageSeen.get(screenId) ?? new Set<string>();
  pageSeen.set(screenId, seen);
  if (!seen.has(message)) {
    seen.add(message);
    report(new Error(message), { region: "preview", screenId });
  }
  pageErrors.set(screenId, message);
  notify();
}

export function clearPageError(screenId: string | null) {
  if (!screenId) return;
  pageSeen.delete(screenId);
  if (pageErrors.delete(screenId)) notify();
}

export const usePageError = (screenId: string) =>
  useSyncExternalStore(subscribe, () => pageErrors.get(screenId) ?? null);
