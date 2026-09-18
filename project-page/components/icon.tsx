import type { ReactNode } from "react";

const paths = {
  arrowUpRight: <path d="M7 17 17 7M7 7h10v10" />,
  arrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />,
  paper: (
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5M9 13h6m-6 4h6" />
    </>
  ),
  code: <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16" />,
  play: <path d="m9 5 11 7-11 7z" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  expand: <path d="M14 4h6v6M10 20H4v-6m16-10-6 6M4 20l6-6" />,
} satisfies Record<string, ReactNode>;

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      width="30"
      height="30"
      viewBox="0 0 32 32"
      fill="none"
    >
      <path
        d="m8 24 8-8m0 0V5m0 11 11-6m-11 6 11 8M8 24V11"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="8" cy="24" r="3" fill="currentColor" />
      <circle cx="16" cy="16" r="3" fill="currentColor" />
      <circle cx="16" cy="5" r="2.5" fill="currentColor" />
      <circle cx="27" cy="10" r="2.5" fill="currentColor" />
      <circle cx="27" cy="24" r="2.5" fill="currentColor" />
      <circle cx="8" cy="11" r="2.5" fill="currentColor" opacity=".4" />
    </svg>
  );
}
