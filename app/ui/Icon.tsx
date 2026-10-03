import type { CSSProperties } from "react";
export type IconName =
  | "search"
  | "pot"
  | "barcode"
  | "scan"
  | "plus"
  | "close"
  | "arrow"
  | "workout"
  | "sleep"
  | "settings"
  | "leaf"
  | "sun"
  | "meal";
const paths: Record<IconName, React.ReactNode> = {
  scan: (
    <>
      <path d="M3 7V3h4m10 0h4v4M3 17v4h4m10 0h4v-4M7 8h10M7 12h10M7 16h6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  pot: (
    <>
      <path d="M5 10h14v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM3 12H1m18 0h4M4 7h16M10 4V2m4 2V2" />
      <path d="M9 7V5h6v2" />
    </>
  ),
  barcode: (
    <>
      <path d="M3 7V3h4m10 0h4v4M3 17v4h4m10 0h4v-4M7 7v10m3-10v10m4-10v10m3-10v10" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  workout: (
    <>
      <path d="m4 9 5-5m6 16 5-5M3 7l4 4m6 6 4 4M8 8l8 8m-14-7 3-3m13 13 3-3" />
    </>
  ),
  sleep: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 3C9 3 4 7 4 13a6 6 0 0 0 6 6c6 0 10-5 10-16Z" />
      <path d="M3 21 15 9" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </>
  ),
  meal: (
    <>
      <path d="M3 12h18a9 9 0 0 1-18 0ZM7 7v-3m5 3V2m5 5V4M7 21h10" />
    </>
  ),
};
export default function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
