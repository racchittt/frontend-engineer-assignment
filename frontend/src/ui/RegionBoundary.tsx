import { Component, type ReactNode } from "react";
import { fail, retry, useRegion, type Scope } from "../regions";
import { Alert } from "./icons";

export function RegionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex max-w-xs flex-col items-center gap-3 rounded-xl bg-white px-6 py-5 text-center shadow-xl ring-1 ring-slate-900/5">
      <span className="flex size-9 items-center justify-center rounded-full bg-red-50 text-red-600">
        <Alert className="size-5" />
      </span>
      <p className="text-sm font-medium text-slate-800">{message}</p>
      <button
        onClick={onRetry}
        // the board pans on pointer down: the button must not start a pan
        onPointerDown={(e) => e.stopPropagation()}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
      >
        Retry
      </button>
    </div>
  );
}

// Catches errors thrown while drawing. React error boundaries must be classes, and they
// don't see async errors: those go through fail() / guard() instead.
class Catch extends Component<
  { scope: Scope; attempt: number; children: ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(error: unknown) {
    fail(this.props.scope, error);
  }
  componentDidUpdate(prev: { attempt: number }) {
    if (prev.attempt !== this.props.attempt && this.state.crashed)
      this.setState({ crashed: false }); // retried: draw the children again
  }
  render() {
    return this.state.crashed ? null : this.props.children;
  }
}

// One region of the UI. While it has an error, the error is shown with a Retry and the
// rest of the app is untouched.
//   default: the error replaces the children, inside a box styled by `className`
//   cover:   the children stay (a preview's iframe keeps loading) and the error sits on top
export function RegionBoundary({
  scope,
  className = "",
  cover = false,
  onRetry,
  children,
}: {
  scope: Scope;
  className?: string;
  cover?: boolean;
  onRetry?: () => void;
  children: ReactNode;
}) {
  const { attempt, error } = useRegion(scope);
  const content = (
    // a retry draws the children fresh, except a cover (the iframe keeps loading)
    <Catch key={cover ? 0 : attempt} scope={scope} attempt={attempt}>
      {children}
    </Catch>
  );
  if (!error) return content;

  const card = (
    <RegionError
      message={error.message}
      onRetry={onRetry ?? (() => retry(scope))}
    />
  );
  return cover ? (
    <>
      {content}
      <div className="absolute inset-0 flex items-center justify-center rounded-md bg-slate-900/60 backdrop-blur-[2px]">
        {card}
      </div>
    </>
  ) : (
    <div className={`flex items-center justify-center ${className}`}>
      {card}
    </div>
  );
}
