import type { SVGProps } from "react";

// Small stroke icons, 16px grid. They take their colour from the text colour.
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const ChevronRight = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Icon>
);

export const Search = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="m10.25 10.25 3 3" />
  </Icon>
);

export const Close = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);

export const Cursor = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m3.5 2.5 9 4-3.8 1.2L7.5 11.5z" />
  </Icon>
);

export const Hand = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 8V3.5a1 1 0 0 1 2 0V7m0-1.5a1 1 0 0 1 2 0V8m0-1.5a1 1 0 0 1 2 0V10a4 4 0 0 1-4 4h-.5a3.5 3.5 0 0 1-2.8-1.4L2.7 9.6a1 1 0 0 1 1.5-1.3L6 10" />
  </Icon>
);

export const Alert = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 2 14.5 13.5h-13z" />
    <path d="M8 6.5v3M8 11.5v.01" />
  </Icon>
);

export const Layers = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m8 2 6 3.2-6 3.2-6-3.2z" />
    <path d="m2 8 6 3.2L14 8M2 10.8 8 14l6-3.2" />
  </Icon>
);

export const Spinner = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p} className={`animate-spin ${p.className ?? ""}`}>
    <path d="M8 2a6 6 0 1 0 6 6" />
  </Icon>
);

export const Plus = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
);

export const Minus = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3.5 8h9" />
  </Icon>
);
