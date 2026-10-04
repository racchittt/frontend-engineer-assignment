import { usePageError } from "../../regions";

// An error inside the page itself. The preview still works, so this is only a badge:
// hover it for the message.
export default function PageErrorBadge({ screenId }: { screenId: string }) {
  const message = usePageError(screenId);
  if (!message) return null;
  return (
    <div className="group absolute right-2 top-2 z-10">
      <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white shadow">
        Page error
      </span>
      <p className="absolute right-0 top-full mt-1 hidden w-64 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block">
        {message}
      </p>
    </div>
  );
}
