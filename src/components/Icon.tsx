import type { SVGProps } from "react";
const paths = {
  open: "M12 16V4m-4 4 4-4 4 4M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  arrowLeft: "m14 6-6 6 6 6",
  arrowRight: "m10 6 6 6-6 6",
  download: "M12 4v12m-4-4 4 4 4-4M4 16v4h16v-4",
  image: "M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4",
  help: "M9.1 8a3 3 0 1 1 4 2.8c-1.1.4-1.1 1.2-1.1 2.2M12 16v.1",
  check: "m5 12 4 4L19 6",
  undo: "M8 5 4 9l4 4M4 9h9a6 6 0 0 1 0 12",
  redo: "m16 5 4 4-4 4M20 9h-9a6 6 0 0 0 0 12",
  link: "m9 15 6-6M8 13l-2 2a3 3 0 0 0 4 4l3-3M11 8l3-3a3 3 0 0 1 4 4l-2 2",
  chevron: "m6 9 6 6 6-6",
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 11l3 3 5-5",
  sun: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1",
  moon: "M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z",
  sliders: "M5 4v16M12 4v16M19 4v16M2 8h6M9 15h6M16 10h6",
} as const;
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
      {name === "sun" ? <circle cx="12" cy="12" r="4" /> : null}
      {name === "help" ? <circle cx="12" cy="12" r="9" /> : null}
    </svg>
  );
}
