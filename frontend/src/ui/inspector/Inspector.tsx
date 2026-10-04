import { useEffect, useReducer, type ReactNode } from "react";
import type { Live } from "../../protocol";
import {
  getSelection,
  onOverlayChange,
  wasSelectionLost,
} from "../../agent/overlay";
import { Alert, Cursor } from "../icons";
import DetailsSection from "./DetailsSection";
import {
  Chip,
  Color,
  Field,
  Mixed,
  Mono,
  Muted,
  Section,
  Skeleton,
} from "./parts";
import { useLiveValues } from "./useLiveValues";

const SECTIONS: { title: string; fields: [keyof Live, string][] }[] = [
  {
    title: "Element",
    fields: [
      ["name", "Name"],
      ["tag", "Tag"],
      ["id", "Id"],
      ["classes", "Classes"],
    ],
  },
  {
    title: "Layout",
    fields: [
      ["size", "Size"],
      ["position", "Position"],
    ],
  },
  {
    title: "Typography",
    fields: [
      ["fontFamily", "Font"],
      ["fontSize", "Size"],
      ["fontWeight", "Weight"],
    ],
  },
  {
    title: "Color",
    fields: [
      ["color", "Text"],
      ["background", "Background"],
    ],
  },
  { title: "Content", fields: [["text", "Text"]] },
];

// How one value is shown
function show(field: keyof Live, value: string): ReactNode {
  if (!value) return <Muted>—</Muted>;
  switch (field) {
    case "classes":
      return (
        <span className="flex flex-wrap gap-1">
          {value.split(/\s+/).map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </span>
      );
    case "color":
    case "background":
      return <Color value={value} />;
    case "tag":
      return <Chip>{value}</Chip>;
    case "size":
    case "position":
    case "id":
    case "fontSize":
    case "fontWeight":
      return <Mono>{value}</Mono>;
    case "text":
      return <span className="line-clamp-4">{value}</span>;
    default:
      return value;
  }
}

function Empty({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon}
      </span>
      <p className="text-xs font-medium text-slate-700">{title}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

// What is selected: its live values, and (for one element) what the API says about it.
const Inspector = () => {
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => onOverlayChange(bump), []);

  const sel = getSelection();
  const boxes = sel?.boxes;
  const { loading, failed, lives, retry } = useLiveValues(boxes, sel?.iframe);

  let body: ReactNode;
  if (!boxes) {
    body = wasSelectionLost() ? (
      <Empty
        icon={<Alert className="size-4.5 text-amber-500" />}
        title="This element no longer exists"
        hint="The page removed it. Pick another."
      />
    ) : (
      <Empty
        icon={<Cursor className="size-4.5" />}
        title="Nothing selected"
        hint="Select an element to inspect it."
      />
    );
  } else if (loading) {
    body = (
      <div className="px-4 py-3">
        <Skeleton />
      </div>
    );
  } else if (failed || !lives) {
    body = (
      <div className="px-4 py-3 text-xs">
        <span className="text-red-600">Couldn't read this element </span>
        <button className="font-medium underline" onClick={retry}>
          Retry
        </button>
      </div>
    );
  } else {
    const found = lives.filter((l): l is Live => l !== null);
    const one = found.length === 1 && boxes.length === 1;
    body = (
      <div className="flex-1 overflow-auto">
        {one ? (
          // a single element: its name and tag head the panel, so they are not repeated below
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold">{found[0].name}</p>
            <p className="mt-1 flex items-center gap-1.5">
              <Chip>{found[0].tag}</Chip>
              {found[0].id && <Mono>#{found[0].id}</Mono>}
            </p>
          </div>
        ) : (
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">{boxes.length} elements</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Fields they don't share read "Mixed".
            </p>
          </div>
        )}
        {SECTIONS.map(({ title, fields }) => {
          const shown = one
            ? fields.filter(([f]) => f !== "name" && f !== "tag" && f !== "id")
            : fields;
          if (!shown.length) return null;
          return (
            <Section key={title} title={title}>
              <dl>
                {shown.map(([field, label]) => {
                  // several elements: the value they all share, or "Mixed"
                  const values = new Set(found.map((l) => l[field] ?? ""));
                  return (
                    <Field key={field} label={label}>
                      {values.size > 1 ? (
                        <Mixed />
                      ) : (
                        show(field, [...values][0])
                      )}
                    </Field>
                  );
                })}
              </dl>
            </Section>
          );
        })}
        {one && (
          <Section title="Details">
            <DetailsSection elementKey={found[0].key} />
          </Section>
        )}
      </div>
    );
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-900">
          Inspector
        </h2>
        {boxes && (
          <span className="text-[11px] text-slate-500">
            {boxes.length} selected
          </span>
        )}
      </div>
      {body}
    </aside>
  );
};

export default Inspector;
