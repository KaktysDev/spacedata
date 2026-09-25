import type { CSSProperties } from "react";
export function Icon({
  name,
  size = 18,
  style,
}: {
  name:
    | "satellite"
    | "globe"
    | "arrow"
    | "reset"
    | "check"
    | "close"
    | "chevron"
    | "spark"
    | "info"
    | "stop";
  size?: number;
  style?: CSSProperties;
}) {
  const paths = {
    satellite: (
      <>
        <path d="m8 8 8 8m-9-3-4-4 4-4 4 4m2 8 4 4 4-4-4-4M9 5l4-3 3 3-3 4M5 9l-3 4 3 3 4-3" />
        <path d="M16 3a5 5 0 0 1 5 5m-5-1a1 1 0 0 1 1 1" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    reset: (
      <>
        <path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m8 5 7 7-7 7" />,
    spark: (
      <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z" />
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v1" />
      </>
    ),
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
