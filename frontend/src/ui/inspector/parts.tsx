import type { ReactNode } from "react";

// A titled group of fields
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-100 px-4 py-3 last:border-b-0">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

// One label and its value
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[84px_1fr] items-baseline gap-2 py-1 text-xs">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 wrap-break-word text-slate-900">{children}</dd>
    </div>
  );
}

export const Muted = ({ children }: { children: ReactNode }) => (
  <span className="text-slate-400">{children}</span>
);

export const Mixed = () => <span className="italic text-slate-400">Mixed</span>;

export const Mono = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[11px]">{children}</span>
);

export const Chip = ({ children }: { children: ReactNode }) => (
  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
    {children}
  </span>
);

export function Color({ value }: { value: string }) {
  const transparent =
    /^rgba\(.*,\s*0\)$/.test(value) || value === "transparent";
  return (
    <span className="flex items-center gap-2">
      <span
        className="size-3.5 shrink-0 rounded-sm ring-1 ring-slate-900/15"
        style={
          transparent
            ? {
                // a checkerboard says "nothing here"
                backgroundImage:
                  "conic-gradient(#e2e8f0 25%, white 0 50%, #e2e8f0 0 75%, white 0)",
                backgroundSize: "6px 6px",
              }
            : { background: value }
        }
      />
      <Mono>{transparent ? "transparent" : value}</Mono>
    </span>
  );
}

// Which status gets which colour in the Details card
export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "stable"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : status === "beta"
        ? "bg-amber-50 text-amber-700 ring-amber-600/20"
        : "bg-slate-100 text-slate-600 ring-slate-500/20";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone}`}
    >
      {status}
    </span>
  );
}

export const Skeleton = () => (
  <div className="animate-pulse space-y-2 py-1">
    <div className="h-2.5 w-3/4 rounded bg-slate-100" />
    <div className="h-2.5 w-1/2 rounded bg-slate-100" />
    <div className="h-2.5 w-2/3 rounded bg-slate-100" />
  </div>
);
